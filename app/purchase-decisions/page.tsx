import { supabaseAdmin } from '@/lib/supabase'
import { readFGStockByBrandSku, readFGIncomingByBrandSku } from '@/lib/fg-inventory'
import { fetchRecentStockMovements } from '@/lib/stock-movements'
import { PurchaseDecisionsTable } from '@/components/PurchaseDecisionsTable'
import { VISIBLE_BRANDS } from '@/lib/visible-brands'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TRACKED_BRANDS = VISIBLE_BRANDS
const LM_MONTHS = 1
const L3M_MONTHS = 3
const L6M_MONTHS = 6
const TARGET_COVERAGE_MONTHS = 3

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function PurchaseDecisionsPage() {
  let fetchError: string | null = null
  let stockMap = new Map<string, number>()
  let incomingMap = new Map<string, number>()
  try {
    [stockMap, incomingMap] = await Promise.all([
      readFGStockByBrandSku(),
      readFGIncomingByBrandSku(),
    ])
  } catch (e: any) {
    fetchError = e.message
  }

  const [
    { data: products },
    movements,
    { data: settings },
    { data: suppliers },
    { data: entities },
    { data: bom },
    { data: packaging },
    { data: activePos },
  ] = await Promise.all([
    supabaseAdmin
      .from('products')
      .select('sku, brand, product_name, safety_stock_qty, moq, lead_time_days, unit_cost, oem_supplier_code, billing_supplier_code'),
    fetchRecentStockMovements(),
    supabaseAdmin.from('app_settings').select('*').eq('key', 'purchase_decision_thresholds').single(),
    supabaseAdmin.from('suppliers').select('supplier_code, supplier_name').order('supplier_name'),
    supabaseAdmin.from('buyer_entities').select('code, legal_name, brands'),
    supabaseAdmin.from('bom').select('product_sku, packaging_code, qty_per_unit, type, source'),
    supabaseAdmin.from('packaging').select('packaging_code, packaging_name, packaging_type, supplier_code, unit_cost, pack_size'),
    supabaseAdmin.from('purchase_orders').select('po_number, status, items:purchase_order_items(sku)').in('status', ['pending', 'approved']),
  ])

  // Map: sku → active PO number (so we can mark SKUs with PO in progress)
  const skuPoMap: Record<string, string> = {}
  for (const po of activePos || []) {
    for (const it of po.items || []) {
      if (it.sku && !skuPoMap[it.sku]) skuPoMap[it.sku] = po.po_number
    }
  }

  // Build BOM map: sku → packaging list (with supplier + cost)
  const pkgByCode = new Map<string, { name: string; type: string | null; supplier_code: string | null; unit_cost: number; pack_size: number }>()
  for (const p of packaging || []) {
    pkgByCode.set(p.packaging_code, {
      name: p.packaging_name || p.packaging_code,
      type: p.packaging_type,
      supplier_code: p.supplier_code || null,
      unit_cost: Number(p.unit_cost) || 0,
      pack_size: Number(p.pack_size) || 1,
    })
  }
  type BomComponent = {
    code: string
    name: string
    qty_per_unit: number
    type: string | null
    supplier_code: string | null
    unit_cost: number
    pack_size: number
  }
  const bomBySku = new Map<string, BomComponent[]>()
  for (const b of bom || []) {
    const pkg = pkgByCode.get(b.packaging_code)
    const list = bomBySku.get(b.product_sku) || []
    list.push({
      code: b.packaging_code,
      name: pkg?.name || b.packaging_code,
      qty_per_unit: Number(b.qty_per_unit) || 0,
      type: b.type || pkg?.type || null,
      supplier_code: b.source || pkg?.supplier_code || null,
      unit_cost: pkg?.unit_cost || 0,
      pack_size: pkg?.pack_size || 1,
    })
    bomBySku.set(b.product_sku, list)
  }

  const thresholds = (settings?.value as any) || { draft_po: 2.5, review: 3.5 }
  const DRAFT_THRESHOLD = Number(thresholds.draft_po ?? 2.5)
  const REVIEW_THRESHOLD = Number(thresholds.review ?? 3.5)

  const today = new Date()
  const lmCutoff = new Date(today.getFullYear(), today.getMonth() - LM_MONTHS, 1)
  const l3mCutoff = new Date(today.getFullYear(), today.getMonth() - L3M_MONTHS, 1)
  const l6mCutoff = new Date(today.getFullYear(), today.getMonth() - L6M_MONTHS, 1)

  const monthly = new Map<string, Map<string, number>>()
  for (const m of movements || []) {
    if (!m.sku || !m.date_start || !m.out_qty) continue
    const d = new Date(m.date_start)
    if (isNaN(d.getTime())) continue
    const k = `${m.brand}::${m.sku}`
    const mk = monthKey(d)
    if (!monthly.has(k)) monthly.set(k, new Map())
    const inner = monthly.get(k)!
    inner.set(mk, (inner.get(mk) || 0) + Number(m.out_qty || 0))
  }

  function avgOver(brand: string, sku: string, cutoff: Date, months: number): number {
    const k = `${brand}::${sku}`
    const inner = monthly.get(k)
    if (!inner) return 0
    let sum = 0
    for (let i = 0; i < months; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i - 1, 1)
      if (d < cutoff) break
      sum += inner.get(monthKey(d)) || 0
    }
    return months > 0 ? sum / months : 0
  }

  type DecisionRow = {
    sku: string
    brand: string
    product_name: string
    closing: number
    incoming: number
    committed: number
    available: number  // = closing + incoming − committed
    safety: number
    moq: number
    lead_days: number
    lm_avg: number
    l3m_avg: number
    l6m_avg: number
    stock_months: number
    suggest_qty: number | null
    status: 'draft' | 'review' | 'healthy'
    unit_cost: number
    supplier_code: string | null
    active_po: string | null
  }

  const rows: DecisionRow[] = []
  for (const p of products || []) {
    if (!p.brand || !TRACKED_BRANDS.has(p.brand)) continue
    const key = `${p.brand}::${p.sku}`
    const closing = stockMap.get(key) || 0
    const incoming = incomingMap.get(key) || 0
    // Available = Closing + Incoming. Stock Commitments are audit-only
    // (the WMS already deducts reserved qty from closing on-hand).
    const available = closing + incoming
    const committed = 0
    const lm = avgOver(p.brand, p.sku, lmCutoff, LM_MONTHS)
    const l3m = avgOver(p.brand, p.sku, l3mCutoff, L3M_MONTHS)
    const l6m = avgOver(p.brand, p.sku, l6mCutoff, L6M_MONTHS)

    const basisAvg = l3m > 0 ? l3m : l6m > 0 ? l6m : lm
    const stockMonths = basisAvg > 0 ? available / basisAvg : 999
    const safety = Number(p.safety_stock_qty) || 0

    let status: 'draft' | 'review' | 'healthy' = 'healthy'
    if (stockMonths < DRAFT_THRESHOLD) status = 'draft'
    else if (stockMonths < REVIEW_THRESHOLD) status = 'review'
    // Fallback (matches Alerts): SKUs with no movement history but below
    // safety stock should still flag as draft — otherwise brand-new SKUs
    // never trigger a PO suggestion.
    else if (basisAvg === 0 && safety > 0 && available < safety) status = 'draft'

    let suggest: number | null = null
    if (status !== 'healthy') {
      if (basisAvg > 0) {
        const need = Math.max(0, basisAvg * TARGET_COVERAGE_MONTHS - available)
        suggest = Math.max(Number(p.moq) || 0, Math.ceil(need / 100) * 100)
      } else if (safety > 0) {
        // No movement: aim for safety stock as the target
        const need = Math.max(0, safety - available)
        suggest = Math.max(Number(p.moq) || 0, Math.ceil(need / 100) * 100)
      } else {
        suggest = Number(p.moq) || null
      }
    }

    rows.push({
      sku: p.sku,
      brand: p.brand,
      product_name: p.product_name || p.sku,
      closing,
      incoming,
      committed,
      available,
      safety,
      moq: Number(p.moq) || 0,
      lead_days: Number(p.lead_time_days) || 0,
      lm_avg: Math.round(lm),
      l3m_avg: Math.round(l3m),
      l6m_avg: Math.round(l6m),
      stock_months: Number(stockMonths.toFixed(2)),
      suggest_qty: suggest,
      status,
      unit_cost: Number(p.unit_cost) || 0,
      supplier_code: p.oem_supplier_code || p.billing_supplier_code || null,
      active_po: skuPoMap[p.sku] || null,
    })
  }

  rows.sort((a, b) => a.stock_months - b.stock_months)

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">Purchase Decisions</strong>
        </div>
        <div className="flex gap-2.5 items-center">
          <input
            type="text"
            placeholder="Search SKU, product, or ask a question"
            className="bg-[#FAFAF7] border border-[#D4D0C7] rounded px-3 py-1.5 text-[13px] w-[300px] focus:outline-none focus:border-[#C8432C]"
          />
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">
              Purchase decision support
            </div>
            <h1 className="text-3xl font-medium tracking-tight">Purchase Decisions</h1>
          </div>
          <button className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[13px] hover:bg-[#FAFAF7]">
            Export
          </button>
        </div>

        <div className="mb-6 p-3.5 border border-[#D4D0C7] bg-[#FAFAF7] rounded text-[12px] text-[#6B6B6B]">
          <span className="font-mono uppercase tracking-wider text-[10px] text-[#C8432C] mr-2">
            Cross-SKU action lens
          </span>
          Select rows with checkbox → click "Draft POs" to draft multiple POs at once. POs are auto-split by (Entity × Supplier × Type). Thresholds: &lt; {DRAFT_THRESHOLD} mo = Draft · {DRAFT_THRESHOLD}–{REVIEW_THRESHOLD} mo = Review · ≥ {REVIEW_THRESHOLD} mo = Healthy.
        </div>

        {fetchError ? (
          <div className="p-4 bg-[#F5DEDA] border border-[#A53025] rounded text-[#A53025] mb-4">
            <strong>Error reading stock:</strong> {fetchError}
          </div>
        ) : null}

        <PurchaseDecisionsTable
          rows={rows}
          suppliers={suppliers || []}
          entities={(entities || []) as any}
          bomBySku={Object.fromEntries(bomBySku)}
        />
      </div>
    </div>
  )
}
