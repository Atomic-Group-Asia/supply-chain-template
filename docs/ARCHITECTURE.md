# Architecture · Atomic Ops

A deeper walkthrough of how data flows through the app. The README has the elevator pitch; this doc is the engineer-onboarding reference.

---

## Table of contents

1. [Auth & roles](#1-auth--roles)
2. [Inventory data sources](#2-inventory-data-sources)
3. [Daily Excel/CSV upload pipeline](#3-daily-excelcsv-upload-pipeline)
4. [Batches & FEFO reconcile](#4-batches--fefo-reconcile)
5. [Purchase orders, receipts & packaging consumption](#5-purchase-orders-receipts--packaging-consumption)
6. [PO Invoices & payment rollup](#6-po-invoices--payment-rollup)
7. [Stock commitments](#7-stock-commitments)
8. [AI Agent](#8-ai-agent)
9. [Caching strategy](#9-caching-strategy)
10. [Storage buckets](#10-storage-buckets)

---

## 1. Auth & roles

### Identities

| Role | Env vars | Access |
|---|---|---|
| `admin` | `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | All pages, all writes |
| `viewer` | `VIEWER_USER` / `VIEWER_PASS` | `/fg-inventory*`, `/hq-stock*`, `/o2o-stock*` only; non-GET API calls → 403 |

### Session model

`lib/auth.ts` issues a single HttpOnly cookie `ops_session` containing a base64url-encoded `{role, exp}` payload, signed with HMAC-SHA256 using `AUTH_SECRET` (with a deterministic fallback derived from the configured passwords so existing deployments never fully break on missing config). 7-day TTL.

`middleware.ts` order of checks per request:
1. Public paths (`/login`, `/api/login`, `/api/logout`, `_next`, images) → allow
2. Cookie session → verify and set `x-user-role` header on the forwarded request
3. HTTP Basic Auth header (fallback for curl scripts and old bookmarks)
4. Otherwise redirect to `/login?next=<requested_path>`

Once authenticated, viewer paths are filtered separately:
- Non-GET API calls → 403
- Non-allowed pages → redirect to `/fg-inventory`

### Login & logout UI

- `/login` — custom form with real `<input name="username" autoComplete="username">` + `<input type="password" autoComplete="current-password">`. Browser password manager saves credentials and offers a dropdown on the username field for multi-account switching.
- `/api/login` — verify creds via `checkCredentials()`, set cookie, return `{role}`.
- `/logout` standalone screen — fires `POST /api/logout` (clears cookie) plus a bogus-Basic-Auth fetch to wipe any browser-cached creds from the previous model, then redirects to `/login`.
- `HeaderLogoutButton` is portal-injected into every page's sticky breadcrumb (next to the EyeToggle pill).

---

## 2. Inventory data sources

```
                ┌──────────────────────────┐
                │  daily_stock_current     │  ← authoritative "Available"
                │  (Postgres table)        │     per (brand, sku)
                └──────────┬───────────────┘
                           │
                           │ readDailyStockAllBrands()      (no filter)
                           │ readFGStockByBrandSku()         (VISIBLE_BRANDS only, 60s cache)
                           ▼
            ┌──────────────────────────────────┐
            │  FG Inventory list               │
            │  Dashboard · Alerts ·            │
            │  Purchase Decisions ·            │
            │  Product / Packaging detail      │
            │  Batches detail pages            │
            │  Agent tool query_inventory      │
            └──────────────────────────────────┘
```

### Source of truth split

| Field on FG Inventory | Source |
|---|---|
| **Available** | `daily_stock_current.qty` (from daily Excel/CSV upload) |
| **Earliest Expiry** | `batches` table, active rows, ASC by expiry, first row |
| **Incoming** | `purchase_order_items` joined to `purchase_orders` where `po_type='FG'` and status ∈ {`approved`, `partial_received`}, summed by `(brand, sku)` |
| **ETA** | Earliest `expected_date` across the same approved/partial PO set per (brand, sku) |
| **Brand / Category / Product Name** | SKU Mapping gsheet (broader than the Supabase products table — covers HJT/TPD/etc.) |

### Why no formula

Pre-2026-06 the formula was `Available = Closing + Incoming − Committed`. That drifted because Incoming counted POs that hadn't arrived and Committed double-deducted what gsheet already netted out. Current model: the warehouse-confirmed daily count IS the truth; everything else is metadata.

---

## 3. Daily Excel/CSV upload pipeline

UI: `/fg-inventory/upload`

```
User picks file
   │
   ▼
POST /api/inventory/preview
   │  • XLSX or CSV parser
   │  • Header auto-detect: any column matching /sku/i,
   │    and value column matching "closing balance" / "closing stock" / "closing"
   │  • Filter rows to user-selected brand
   │  • Diff against current daily_stock_current
   ▼
Preview UI shows {inflow, outflow, no_change} per SKU
   │
   │  User reviews and clicks Apply
   ▼
POST /api/inventory/apply
   │  • Upsert daily_stock_current per (brand, sku, qty)
   │  • Optional FEFO batch deduction if d.fefo_plan was attached
   │  • Audit row in stock_upload_log
   │  • invalidateStockCache() so next read is fresh
   ▼
FG Inventory + all downstream pages immediately reflect new Available
```

`stock_upload_log` shows in the FG Inventory header as the "Last upload" chip per brand.

---

## 4. Batches & FEFO reconcile

### Model

The `batches` table is an **expiry ledger**. Each row records what OEM produced: batch number, expiry date, original qty, qty_remaining. Multiple batches per SKU.

### Reconcile algorithm (`lib/batch-reconcile.ts`)

When called with `(brand, sku)`:

1. Read Available from `readDailyStockAllBrands()` (env-gated — `daily_stock_current` on prod, gsheet `WH_Summary` on demo via `AVAILABLE_SOURCE=gsheet`)
2. Read all batches for this SKU
3. Sort by `expiry_date` ASC (oldest first)
4. Walk in **reverse** (newest first) and fill `qty_remaining`:
   ```
   remaining = available
   for batch in batches reversed:
     take = min(batch.qty, remaining)
     batch.qty_remaining = take
     batch.status = take > 0 ? 'active' : 'depleted'
     remaining -= take
   ```
5. Result: sum of active `qty_remaining` exactly equals Available; oldest batches deplete first (FEFO).

### Multi-warehouse safety

Same SKU code can legitimately exist under different brand (`Nattome` MY warehouse vs `NattomeSG` SG warehouse) with completely independent stock + batches. `SkuSearchInput` and `NewBatchButton` together:

- Keyed by `${brand}::${sku}` so multi-brand matches all show in the dropdown
- When the typed SKU has multiple brand matches, an amber prompt forces the user to pick a brand explicitly
- `BatchModal` only opens once both brand AND sku are unambiguous

This prevents the previous silent bug where `products.find(p => p.sku === ...)` returned the first match and tagged batches to the wrong warehouse.

### Batch creation rules

- **Batch number is optional**: if blank, the API generates a `NO-BATCH-YYYYMMDD-XXXX` placeholder (DB column is `NOT NULL` so something has to go in). User can edit later when OEM gives the real number.
- **Expiry date is required**.
- **Qty received is required**; the modal no longer asks for `qty_remaining` — reconcile sets it.
- **Dates display as DD/MM/YYYY** everywhere in the batches UI (input still ISO via the native date picker).

### Trigger points

| Event | Reconcile scope |
|---|---|
| `POST /api/batches` (add) | That SKU only |
| `PATCH /api/batches/[id]` (edit) | That SKU only |
| `DELETE /api/batches/[id]` | That SKU only (pre-read brand/sku before delete) |
| `/batches` list page load | ALL SKUs that have batches (chunks of 8 parallel) |
| `/batches/[brand]/[sku]` detail page load | That SKU only |
| `/fg-inventory/[brand]/[sku]` detail page load | That SKU only |
| Manual "⟳ Reconcile FEFO" button | `POST /api/batches/reconcile` — all SKUs |

### UI: 2-level drill-down

- `/batches` — by-SKU summary card with brand filter chips, active batch count, total active qty, earliest expiry
- `/batches/[brand]/[sku]` — Active / Depleted / All tabs with per-batch detail; summary band shows Available · Recorded · Active total · Reconcile status (Balanced / Gap / Over)

---

## 4b. Stock Movements ledger

The `stock_movements` table holds monthly per-SKU in/out from Excel uploads. Surfaced in three places:

- `/stock-movements` — global list, paginated brand + month filter chips.
- `/fg-inventory/[brand]/[sku]` — Stock Movements table at the bottom showing every monthly row for that SKU (in/out/closing).
- Velocity helpers (`lib/stock-movements.ts`) feed L3M/L6M/LM averages to Alerts, Purchase Decisions, Dashboard, Products list.

### Pagination guard

Supabase enforces a **1000-row response cap** at the project level. The table holds >1000 rows, so any cross-brand query MUST paginate. `lib/stock-movements.ts` exposes:

- `fetchAllStockMovements(cutoff?)` — pages through 1000-row chunks
- `fetchRecentStockMovements()` — convenience: 200 days back from now (the standard L3M/L6M window)

Pre-fix symptom: HJT WW001's Avg/mo on the Products list was 1,024 while the detail page (per-SKU query, no cap) correctly showed 6,656. Anywhere reading across-all-brands must call the paginated helper, not raw `supabaseAdmin.from('stock_movements').select(...)`.

---

## 5. Purchase orders, receipts & packaging consumption

### PO lifecycle

```
pending → approved → partial_received → received
              ▲             │     ↑
              │             └─────┤
              │  revert_receipt   │
              └───────────────────┘
              (Mark Received + ↶ Revert to Approved)
```

`partial_received` happens when sum of `received_qty` is between 0 and ordered total; `received` when fully closed.

**Revert receipt** (`action='revert_receipt'`) — undoes a misclick:
1. Reads every `packaging_movements` row with `source_po_id = this PO`
2. Adds the consumed qty back to `packaging.stock_balance` per packaging_code
3. Deletes the movement rows (clean undo — they would otherwise show on the Consumption tab as fake history)
4. Resets every line's `received_qty` to 0
5. Header → `approved`, clears `received_at` / `received_by`

### Per-line ETA

`purchase_order_items.expected_date` (DATE, nullable) lets each line carry its own arrival date. PO header `expected_date` remains as the fallback for lines without their own.

Display:
- **Manual PO + PO Edit forms** — each row has its own date picker.
- **PO detail line items table** — ETA column; ink for line ETA, muted grey for header-inherited.
- **PO list ETA column** — `min(line.expected_date)` with header fallback, so a multi-batch PO surfaces its soonest arrival.
- **FG Inventory SKU detail → Incoming Shipments table** — picks line ETA first, `(hdr)` tag when inherited.
- **`readFGIncomingETAByBrandSku`** (FG Inventory list ETA column) — same fallback priority.

### Packaging auto-deduct on FG receipt (`lib/packaging-consumption.ts`)

When `PATCH /api/purchase-orders/[id]` with `action: 'mark_received'`:

1. Capture each line's previous `received_qty`
2. Persist new values
3. **If po_type === 'FG'**, compute deltas (new − old) per line
4. For every positive delta, look up `bom` rows for that FG SKU
5. For each BOM component: `consume_qty = qty_per_unit × delta`
6. Update `packaging.stock_balance -= consume_qty` (allowed to go negative — UI warns)
7. Insert one `packaging_movements` row per (FG, packaging) pair with full provenance:
   ```
   { packaging_code, qty_delta (negative), reason='fg_po_receipt',
     source_po_id, source_po_line_id, fg_sku, fg_qty, qty_per_unit }
   ```

### Preview endpoint

`POST /api/purchase-orders/[id]/consumption-preview` returns the same data without writes — used by the Receive modal to show "Packaging that will be consumed" with shortfall warnings before the user confirms.

### Receive modal UX

- Per-line received_qty inputs (defaults to fully-received remaining)
- Live consumption preview table: SKU · Packaging · Per Unit · Consume · On Hand · After
- ⚠ Red indicator if any packaging would go negative

---

## 6. PO Invoices & payment rollup

### Tables

```sql
po_invoices         -- one row per OEM-issued invoice
  id, po_id, invoice_number, invoice_date, amount,
  pdf_path, paid_amount, paid_status, paid_at, paid_by, ...

po_invoice_items    -- linking invoice to specific PO line items
  id, invoice_id, po_item_id, qty
```

### Flow

```
PO is approved / partial_received / received
   │
   ▼
User clicks "+ Add Invoice" on PO detail
   │
   ▼
AddInvoiceModal
   • invoice_number, invoice_date, amount, notes
   • PDF upload (multipart)
   • Tick PO lines covered + qty per line (defaults to remaining qty
     after subtracting already-allocated qty from other invoices)
   │
   ▼
POST /api/purchase-orders/[id]/invoices
   • Upload PDF to po-invoices/<poId>/<uuid>.pdf
   • Insert po_invoices header
   • Insert po_invoice_items rows
   • On any failure, roll back the PDF upload
   │
   ▼
PATCH /api/po-invoices/[id]  action=record_payment
   • Increment paid_amount
   • Recompute paid_status: paid | partial | unpaid
   • rollupPoPaymentStatus(po_id):
       - Sum all invoices' amount + paid_amount for that PO
       - Set purchase_orders.{paid_amount, payment_status, paid_at}
```

### Rollup rule

```
total_invoiced = SUM(po_invoices.amount)
total_paid     = SUM(po_invoices.paid_amount)

PO.payment_status =
  total_invoiced > 0 AND total_paid >= total_invoiced  → 'paid'
  total_paid > 0                                       → 'partial'
  otherwise                                            → 'unpaid'
```

This rules out the old "record payment directly against the PO" path — payments now flow through an invoice.

### PDF download

Stored privately in Storage bucket `po-invoices`. The `GET /api/po-invoices/[id]` endpoint returns a 30-minute signed URL on demand.

---

## 7. Stock commitments

`stock_commitments` table holds reservations (e.g. "marketing campaign needs 200 units of N-RNR-SACHET by date X"). Multi-SKU groups link via `commitment_group_id`. Attachments (proof of brief, etc.) go to Storage bucket `commitment-attachments`.

### Display rule (post-2026-06)

Commitments are **record-only** — they do NOT deduct from Available, because the warehouse-confirmed gsheet count already nets them out. On Product / Packaging detail pages they appear in the Stock Position card under a dashed-line "(as record)" section with the note "Already deducted in gsheet Available — shown here for visibility only."

---

## 7b. Alerts model

`/alerts` aggregates from multiple sources and surfaces them via `AlertsTable`. Four alert types: `low_stock`, `expiry`, `overdue`, `packaging`.

### Low-stock trigger order (first match wins)

For each product (skipping discontinued / suspended / development / sachet):

1. `stock_months < 2.5` → 🔴 Critical (velocity-based, matches Purchase Decisions draft threshold)
2. `safety_stock_qty > 0` AND `available < safety` AND no velocity → 🔴 Critical
3. `available < 500` → 🔴 Critical (absolute floor for SKUs with no velocity data)
4. `available < 1000` → 🟡 Watch (early warning)

Velocity comes from `basisAvg(brand, sku)` = L3M → L6M → LM fallback, computed from `stock_movements`. Numbers are guaranteed correct because the page uses `fetchRecentStockMovements()` (paginated).

### Expiry trigger

Per active batch, days-to-expiry windows: `< 30d critical`, `< 90d`, `< 6mo`, `< 12mo`. Sachet SKUs skipped.

### Alert shape (Alert type)

```ts
{
  key, type, subject, sku?, brand?,
  details, details_sensitive?,
  tier?: 'critical' | 'watch',
  on_hand?, months_left?, avg_per_month?,  // structured fields for low_stock
  suggested_action, delivered,
  status: 'new' | 'acknowledged',
  bucket: 'active' | 'processing',
  po_ref?
}
```

### Table behaviour

- **Columns**: Type · SKU · Product · Tier · On Hand · Months Left · Avg/mo · Suggested Action · Status · Action.
- **Sort**: default urgency (status → tier → months_left → on_hand). Months Left and Avg/mo have click-to-sort headers; nulls always sink.
- **Filters**: type chip row (Low Stock / Overdue / Expiry / Packaging / All) plus a brand chip row whose counts auto-update with the type tab.
- **Status**: just `new` / `acknowledged` (the old `sent` placeholder was removed).

---

## 8. AI Agent

### Stack

- DeepSeek V3 (`deepseek-chat`) via OpenAI-compatible endpoint
- `lib/agent-tools.ts` defines 6 function-calling tools
- `lib/agent-prompts.ts` builds the role-tailored system prompt
- Streaming via SSE; cards (POs, alerts, draft messages) rendered alongside text

### Anti-speculation guardrails

The prompt explicitly forbids:
- Inferring meaning from SKU codes
- Volunteering "related SKUs" when a queried SKU isn't found
- Speculating why a SKU might be missing
- Inventing brand stories / positioning / channel strategy

For unknown SKUs the only allowed response is:
> "No record of <SKU-CODE> in my data."

### Persistence

`agent_conversations` + `agent_messages` tables; strict per-viewer isolation enforced at DB query, sessionStorage key, and loadConv runtime check.

---

## 9. Caching strategy

Every page is `force-dynamic` (`export const dynamic = 'force-dynamic'`, no ISR). Fast-changing data lives in two small in-memory caches:

| Cache | TTL | Key | Invalidated by |
|---|---|---|---|
| FG stock (`cachedStock`) | 60s | per Vercel function instance | `invalidateStockCache()` after `/api/inventory/apply` |
| WH_Summary gsheet (`cachedWHAvailable`) | 60s | per Vercel function instance | `invalidateWHSummaryCache()` from `batch-reconcile` |

These are intentionally per-instance + short-TTL — the alternative (Vercel KV / Redis) added complexity without proportional savings given how spiky the traffic is.

---

## 10. Storage buckets

| Bucket | Visibility | Used for |
|---|---|---|
| `commitment-attachments` | Private | Stock commitment photos / PDFs (proof of brief, campaign requirements) |
| `po-invoices` | Private | OEM invoice PDFs linked to `po_invoices.pdf_path` |

Both are accessed via signed URLs only; never made public. The `service_role` key uploads/downloads on the server, never exposed to client.

---

## Pages → data dependencies (quick reference)

| Page | Reads |
|---|---|
| `/fg-inventory` | `readDailyStockAllBrands` (env-gated), batches, FG POs (approved/partial, line + header ETA), SKU Mapping gsheet, `stock_upload_log` |
| `/fg-inventory/[brand]/[sku]` | Above + per-SKU Incoming Shipments + per-SKU Stock Movements ledger; auto-reconciles batches |
| `/products` | products + `fetchRecentStockMovements` (paginated) + `readFGStockByBrandSku` + `readFGIncomingByBrandSku` |
| `/products/[sku]` | products, BOM, suppliers, FG POs, commitments, `readFGStockByBrandSku`, sales movements |
| `/batches` | All batches → by-SKU summary; auto-reconciles all SKUs on load |
| `/batches/[brand]/[sku]` | Batches for that SKU + env-gated stock + reconcile |
| `/packaging/[code]` | packaging master, BOM (usage), packaging POs, `packaging_movements` |
| `/purchase-orders` | All POs + items (uses `min(line.expected_date)` for the ETA column) |
| `/purchase-orders/[id]` | PO + items (with per-line `expected_date`) + invoices + invoice items |
| `/hq-stock`, `/o2o-stock` | WH_Summary + brand-tab gsheets |
| `/dashboard`, `/alerts`, `/purchase-decisions` | `readFGStockByBrandSku` + open POs + commitments + `fetchRecentStockMovements` (paginated) |
| `/stock-movements` | Paginated stock_movements (1742+ rows) |
| `/agent` | All of the above via 6 tools |

---

## Adding a new feature: checklist

1. **Migrate first.** New SQL goes in `migrations/<date>-<name>.sql`. Tell the user to run it on Supabase prod + demo.
2. **Wire in the read.** Add helper to `lib/fg-inventory.ts` or a new `lib/<feature>.ts`.
3. **Hook into the brand filter.** If the feature is brand-specific, respect `VISIBLE_BRANDS`.
4. **Force-dynamic the page.** No ISR.
5. **Page padding.** Use the standard `<div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">` wrapper inside the sticky breadcrumb.
6. **Mobile-check.** Sidebar collapses to hamburger; tables wrap or scroll; chips wrap.
7. **Cookie session.** If viewer access matters, decide page-level vs API-level enforcement.
8. **Agent tool?** If the feature surfaces data users will ask about, add a tool in `lib/agent-tools.ts` so the AI can answer.

---

_Last updated: 2026-06-24_
