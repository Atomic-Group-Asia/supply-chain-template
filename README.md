# Supply Chain Template

> A fork-ready demo of a **hybrid agent-first supply chain operations dashboard**. Inventory, purchase orders, alerts, stock movements, batches, BOM, packaging, suppliers — all wired up with sample data so you can see exactly how it works in 30 seconds.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FAtomic-Group-Asia%2Fsupply-chain-template&project-name=supply-chain-demo&repository-name=supply-chain-demo)

[![Built with Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)
[![Demo mode](https://img.shields.io/badge/Demo-Zero%20config-blue?style=flat-square)]()

---

## ✨ What you get

A self-contained dashboard with **15 sample SKUs across 3 brands**, **5 sample purchase orders**, **8 batches**, **12 months of stock movements**, and a working UI for every operational flow — without needing a database, auth provider, or API key.

| Module | What's in the demo |
| --- | --- |
| **Dashboard** | KPI cards, brand health, stock value, monthly outflow trend |
| **Alerts** | Per-brand months-of-stock thresholds, per-SKU qty floor, critical/healthy tiers |
| **Purchase Decisions** | Stock-months calc, draft/review/healthy classification |
| **Purchase Orders** | Draft → Pending → Approved → Received/Partial-Received lifecycle, per-line ETA |
| **FG Inventory** | Two-warehouse stock (HQ + Retailer), batch breakdown per SKU, FEFO ledger |
| **Batches** | Manufactured / expiry dates, qty_remaining, expiring-soon highlights |
| **Stock Movements** | Monthly in/out/closing ledger, 12 months history |
| **Stock Commitments** | Multi-SKU reservations against available stock |
| **BOM** | Per-FG packaging breakdown, click-row to edit |
| **Packaging** | Box / Bottle / Foil / Label, with brand chip filter |
| **Suppliers** | OEM vs Packaging suppliers, payment terms, contact channels |
| **AI Agent** | Placeholder — wire up DeepSeek/OpenAI key to enable |

Everything is **read + write** through an in-memory mock — edit, create, delete works during the session, resets on full server restart.

---

## 🚀 1-click deploy

Click the **Deploy with Vercel** button at the top of this README. That's it.

- No Supabase project to set up
- No env vars to configure
- No API keys needed
- 30 seconds to a live URL

To preview locally first:

```bash
npm install
npm run dev
# open http://localhost:3000
```

---

## 🎨 Make it yours

The template is designed to be customized by editing a handful of files — no env vars required.

### 1. Company name + warehouse names

`lib/config.ts`:

```ts
export const COMPANY_NAME = 'Acme Co'
export const WAREHOUSES = { hq: 'Main', retailer: 'Stores' }
export const CURRENCY = 'USD'
```

Or override via env vars (Vercel Project Settings → Environment Variables):

```
NEXT_PUBLIC_COMPANY_NAME=Acme Co
NEXT_PUBLIC_WAREHOUSE_HQ_NAME=Main
NEXT_PUBLIC_WAREHOUSE_RETAILER_NAME=Stores
NEXT_PUBLIC_CURRENCY=USD
```

### 2. Brand list

`lib/visible-brands.ts`:

```ts
export const BRANDS = ['Apparel', 'Beauty', 'Home & Living'] as const
```

The chip filter, alert settings, agent tools, and every dropdown update automatically.

### 3. Sample data

Each table lives in its own file under `lib/demo-data/`:

```
lib/demo-data/
├── suppliers.ts
├── products.ts
├── packaging.ts
├── bom.ts
├── purchase-orders.ts
├── batches.ts
├── stock-movements.ts
├── daily-stock.ts
├── stock-commitments.ts
└── brand-alert-settings.ts
```

Edit any of these arrays to put your own SKUs / batches / POs into the demo. Refresh — done.

### 4. Enable the AI Agent

Get an API key from [DeepSeek](https://platform.deepseek.com/) (or any OpenAI-compatible provider) and add `DEEPSEEK_API_KEY` to your Vercel project env vars. The agent UI replaces its "Demo mode" placeholder automatically.

---

## 🏗️ How it works (short version)

```
app/         Next.js 14 App Router routes (~24 pages)
components/  Reusable UI pieces (tables, modals, sidebar)
lib/
├── supabase.ts        ← Mock Supabase client — same .from(...).select().eq() chain
├── demo-data/         ← All the seed data as plain TypeScript arrays
├── config.ts          ← Company / warehouse / currency
├── visible-brands.ts  ← Brand list
├── entity-map.ts      ← Brand → buyer entity (for PO PDFs)
└── ...                ← Velocity calc, FEFO reconcile, packaging consumption
middleware.ts          ← Auth disabled in demo (everyone is admin)
```

The trick that makes this work without a database: `lib/supabase.ts` exports the SAME `supabaseAdmin` symbol the production app uses, but its `from(...).select(...).eq(...)` chain reads from `lib/demo-data/*.ts` arrays instead of hitting Supabase. **No application code knows the difference.**

When you fork and want a real DB:

1. Replace `lib/supabase.ts` with the standard `createClient(url, key)` export
2. Create the matching tables in your Supabase project (schema is documented in each demo-data file)
3. Set `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env vars

The rest of the codebase keeps working.

---

## 📜 License

MIT — see [LICENSE](LICENSE).

This is a template intended as a starting point. Use it, fork it, ship it. Attribution appreciated but not required.
