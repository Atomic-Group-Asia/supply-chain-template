import { supabaseAdmin } from '@/lib/supabase'
import { readFGStockByBrandSku, readFGIncomingByBrandSku } from '@/lib/fg-inventory'
import { fetchRecentStockMovements } from '@/lib/stock-movements'
import { BRAND_TO_ENTITY } from '@/lib/entity-map'
import { Sensitive } from '@/components/PriceVisibility'
import { VISIBLE_BRANDS } from '@/lib/visible-brands'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TRACKED_BRANDS = VISIBLE_BRANDS

// Brand → buyer entity legal name shown in Brand Stock Health.
// Edit to match your entity setup.
const ENTITY_LABEL: Record<string, string> = {
  YOURCO: 'Your Company',
}

type BrandRow = {
  brand: string
  units: number
  value: number
  pct: number
  skus: number
  healthy: number
  low: number
  critical: number
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function fetchData() {
  const [stockMap, incomingMap] = await Promise.all([
    readFGStockByBrandSku(),
    readFGIncomingByBrandSku(),
  ])
  const [{ data: products }, { data: pos }, { data: settings }, movements] = await Promise.all([
    supabaseAdmin.from('products').select('sku, brand, product_name, safety_stock_qty, unit_cost'),
    supabaseAdmin.from('purchase_orders').select('po_number, status, total_amount, expected_date'),
    supabaseAdmin.from('app_settings').select('*').eq('key', 'purchase_decision_thresholds').single(),
    fetchRecentStockMovements(),
  ])

  const th = (settings?.value as any) || { draft_po: 2.5, review: 3.5 }
  const DRAFT = Number(th.draft_po)
  const REVIEW = Number(th.review)

  // Monthly outflow per SKU
  const monthly = new Map<string, Map<string, number>>()
  for (const m of movements || []) {
    if (!m.sku || !m.date_start || !m.out_qty) continue
    const d = new Date(m.date_start); if (isNaN(d.getTime())) continue
    const k = `${m.brand}::${m.sku}`
    const mk = monthKey(d)
    if (!monthly.has(k)) monthly.set(k, new Map())
    monthly.get(k)!.set(mk, (monthly.get(k)!.get(mk) || 0) + Number(m.out_qty || 0))
  }
  const today = new Date()
  function avgOver(brand: string, sku: string, months: number) {
    const inner = monthly.get(`${brand}::${sku}`); if (!inner) return 0
    let s = 0
    for (let i = 0; i < months; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i - 1, 1)
      s += inner.get(monthKey(d)) || 0
    }
    return months > 0 ? s / months : 0
  }
  // Matches Purchase Decisions + Alerts: L3M → L6M → LM fallback
  function basisAvg(brand: string, sku: string) {
    const l3 = avgOver(brand, sku, 3); if (l3 > 0) return l3
    const l6 = avgOver(brand, sku, 6); if (l6 > 0) return l6
    return avgOver(brand, sku, 1)
  }

  let totalValue = 0
  let activeSkus = 0
  let lowStock = 0
  const brandAgg: Record<string, BrandRow> = {}

  for (const p of products || []) {
    if (!TRACKED_BRANDS.has(p.brand)) continue
    activeSkus++
    const k = `${p.brand}::${p.sku}`
    const closing = stockMap.get(k) || 0
    const incoming = incomingMap.get(k) || 0
    // Available = Closing + Incoming.
    // Stock Commitments are tracked separately as an audit log; the WMS
    // already deducts reserved qty from on-hand before it flows into the
    // live WH Summary sheet, so subtracting committed here would double-count.
    const available = closing + incoming
    const unitCost = Number(p.unit_cost) || 0
    const safety = Number(p.safety_stock_qty) || 0
    // Stock value uses physical on-hand only (closing × cost), not Available —
    // because incoming hasn't been paid/received yet and committed is still ours.
    const value = closing * unitCost
    totalValue += value

    const basis = basisAvg(p.brand, p.sku)
    const months = basis > 0 ? available / basis : 999
    let bucket: 'healthy' | 'low' | 'critical' = 'healthy'
    if (months < DRAFT) bucket = 'critical'
    else if (months < REVIEW) bucket = 'low'

    // Low-stock count: matches Alerts + Purchase Decisions logic exactly
    const isLowStock = months < DRAFT || (basis === 0 && safety > 0 && available < safety)
    if (isLowStock) lowStock++

    if (!brandAgg[p.brand]) {
      brandAgg[p.brand] = { brand: p.brand, units: 0, value: 0, pct: 0, skus: 0, healthy: 0, low: 0, critical: 0 }
    }
    const b = brandAgg[p.brand]
    // "Units in hand" = physical closing stock (not Available — Available
    // includes future incoming which isn't in the warehouse yet)
    b.units += closing
    b.value += value
    b.skus += 1
    b[bucket] += 1
  }

  for (const b of Object.values(brandAgg)) {
    b.pct = totalValue > 0 ? (b.value / totalValue) * 100 : 0
  }
  const brandRows = Object.values(brandAgg).sort((a, b) => b.value - a.value)

  const todayISO = today.toISOString().slice(0, 10)
  const pendingApprovals = (pos || []).filter(p => p.status === 'pending').length
  const openPOValue = (pos || []).filter(p => p.status === 'approved').reduce((s, p) => s + (Number(p.total_amount) || 0), 0)
  const overduePos = (pos || []).filter(p => p.status === 'approved' && p.expected_date && p.expected_date < todayISO).length

  // L3M outflow value (annualised) / avg inventory value → inventory turnover
  let l3mOutValue = 0
  for (const p of products || []) {
    if (!TRACKED_BRANDS.has(p.brand)) continue
    // Use strict L3M here (not the fallback) since turnover is an industry
    // benchmark — sticking to 3-month outflow makes the figure comparable.
    const basis = avgOver(p.brand, p.sku, 3)
    l3mOutValue += basis * (Number(p.unit_cost) || 0) * 3 // L3M total
  }
  const annualisedOut = l3mOutValue * 4 // 3 months × 4 = annual
  const turnover = totalValue > 0 ? annualisedOut / totalValue : 0

  return {
    totalValue,
    activeSkus,
    lowStock,
    pendingApprovals,
    openPOValue,
    overduePos,
    brandRows,
    turnover,
  }
}

export default async function DashboardPage() {
  const data = await fetchData()
  const today = new Date().toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' }).toUpperCase()

  // Mock aging data (per user request — until batches.expiry_date is wired)
  // Semantics: shelf life REMAINING (not age since manufacture)
  //   > 12 mo expiry left → Fresh (healthy)
  //   6–12 mo expiry left → Aging (monitor, prep promo)
  //   < 6 mo expiry left  → Expiring soon (clearance NOW)
  const aging = {
    fresh: { value: Math.round(data.totalValue * 0.64), pct: 64, note: 'healthy shelf life', tone: 'green' as const },
    aging: { value: Math.round(data.totalValue * 0.28), pct: 28, note: 'prep promo soon', tone: 'amber' as const },
    stale: { value: Math.round(data.totalValue * 0.08), pct: 8, note: 'clearance now', tone: 'red' as const },
  }

  return (
    <div>
      {/* Top breadcrumb bar */}
      <div className="bg-white border-b border-[#D4D0C7] px-4 sm:px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between gap-3">
        <div className="font-mono text-xs text-[#6B6B6B] truncate">
          Your Company · <strong className="text-[#1A1A1A]">Dashboard</strong>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative hidden md:block">
            <input
              type="text"
              placeholder="Search SKU, PO, supplier, or ask a question…"
              className="pl-8 pr-3 py-1.5 border border-[#D4D0C7] rounded text-[12px] w-[280px] focus:outline-none focus:border-[#C8432C]"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B6B6B]">⌕</span>
          </div>
          <Link href="/dashboard" className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[12px] hover:bg-[#FAFAF7]">Dashboard</Link>
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        {/* Page title */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3 pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">
              Reference view · {today}
            </div>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight">Dashboard</h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href="/agent" className="px-3.5 py-1.5 border border-[#D4D0C7] rounded text-[13px] hover:bg-[#FAFAF7]">← Back to Agent</Link>
            <button className="px-3.5 py-1.5 border border-[#D4D0C7] rounded text-[13px] hover:bg-[#FAFAF7]">Export</button>
          </div>
        </div>

        {/* KPI strip — 5 cards, stack on mobile */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <KpiCard label="Total stock value" value={<Sensitive><>RM {fmtMoney(data.totalValue)}</></Sensitive>} sub={`In hand · ${data.activeSkus} SKUs`} accent="red" href="/fg-inventory" />
          <KpiCard label="Active SKUs" value={String(data.activeSkus)} sub={`${data.brandRows.length} brand${data.brandRows.length === 1 ? '' : 's'}`} accent="black" href="/products" />
          <KpiCard label="Low stock" value={String(data.lowStock)} sub="below safety" accent="amber" href="/alerts" />
          <KpiCard label="Pending approvals" value={String(data.pendingApprovals)} sub="awaiting you" accent="red" href="/approvals" />
          <KpiCard label="Open PO value" value={<Sensitive><>RM {fmtMoney(data.openPOValue)}</></Sensitive>} sub={`${data.overduePos > 0 ? `${data.overduePos} overdue` : 'Committed'}`} accent="black" href="/purchase-orders" />
        </div>

        {/* Stock Value by Brand + Aging — stack on mobile, side-by-side from lg */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-5 mb-6">
          {/* Stock Value by Brand */}
          <div className="bg-white border border-[#D4D0C7] rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#D4D0C7]">
              <div className="font-medium text-[14px]">Stock value by brand</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mt-0.5">
                RM in hand · current snapshot
              </div>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[520px]">
              <thead>
                <tr className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
                  <th className="text-left px-5 py-2 font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] font-medium">Brand</th>
                  <th className="text-right px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] font-medium">Units</th>
                  <th className="text-right px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] font-medium">Value (RM)</th>
                  <th className="text-right px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] font-medium">% of total</th>
                  <th className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] font-medium w-[28%]">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {data.brandRows.map((b) => (
                  <tr key={b.brand} className="border-b border-[#F0EDE4]">
                    <td className="px-5 py-2.5 font-medium">{b.brand}</td>
                    <td className="text-right px-3 py-2.5 font-mono">{b.units.toLocaleString()}</td>
                    <td className="text-right px-3 py-2.5 font-mono"><Sensitive>{b.value.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</Sensitive></td>
                    <td className="text-right px-3 py-2.5 font-mono">{b.pct.toFixed(1)}%</td>
                    <td className="px-3 py-2.5">
                      <div className="h-1.5 bg-[#F0EDE4] rounded-full overflow-hidden">
                        <div className="h-full bg-[#C8432C]" style={{ width: `${b.pct}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-[#FAFAF7]">
                  <td className="px-5 py-2.5 font-medium">Total</td>
                  <td className="text-right px-3 py-2.5 font-mono font-medium">{data.brandRows.reduce((s, b) => s + b.units, 0).toLocaleString()}</td>
                  <td className="text-right px-3 py-2.5 font-mono font-medium"><Sensitive>{Math.round(data.totalValue).toLocaleString('en-MY')}</Sensitive></td>
                  <td className="text-right px-3 py-2.5 font-mono font-medium">100%</td>
                  <td className="px-3 py-2.5 text-[#6B6B6B]">—</td>
                </tr>
              </tbody>
            </table>
            </div>
          </div>

          {/* Stock Value by Aging */}
          <div className="bg-white border border-[#D4D0C7] rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#D4D0C7]">
              <div className="font-medium text-[14px]">Stock value by expiry</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mt-0.5">
                Shelf life remaining · clearance signal
              </div>
            </div>
            <div className="px-5 py-4 flex flex-col gap-4">
              <AgingRow label="Fresh (over 12 months left)" value={aging.fresh.value} pct={aging.fresh.pct} note={aging.fresh.note} tone="green" />
              <AgingRow label="Aging (6–12 months left)" value={aging.aging.value} pct={aging.aging.pct} note={aging.aging.note} tone="amber" />
              <AgingRow label="Expiring soon (under 6 months left)" value={aging.stale.value} pct={aging.stale.pct} note={aging.stale.note} tone="red" />
              <div className="border-t border-dashed border-[#D4D0C7] pt-3 flex justify-between items-baseline">
                <div>
                  <div className="font-medium text-[13px]">Inventory turnover (annualised)</div>
                  <div className="font-mono text-[10px] text-[#6B6B6B] mt-0.5">Industry FMCG benchmark: 6–8×</div>
                </div>
                <div className="font-mono text-[20px] font-medium">{data.turnover.toFixed(1)}×</div>
              </div>
            </div>
          </div>
        </div>

        {/* Brand Stock Health */}
        <div className="bg-white border border-[#D4D0C7] rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#D4D0C7]">
            <div className="font-medium text-[14px]">Brand stock health</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mt-0.5">
              3 entities · {data.brandRows.length} brands
            </div>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-[12px] min-w-[720px]">
            <thead>
              <tr className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
                <th className="text-left px-5 py-2 font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] font-medium">Brand</th>
                <th className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] font-medium">Entity</th>
                <th className="text-right px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] font-medium">SKUs</th>
                <th className="text-right px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] font-medium">Healthy</th>
                <th className="text-right px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] font-medium">Low</th>
                <th className="text-right px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] font-medium">Critical</th>
                <th className="text-left px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] font-medium w-[30%]">Stock level</th>
              </tr>
            </thead>
            <tbody>
              {data.brandRows.map((b) => {
                const entityCode = BRAND_TO_ENTITY[b.brand] || ''
                const entityLabel = ENTITY_LABEL[entityCode] || entityCode
                const healthyPct = b.skus > 0 ? (b.healthy / b.skus) * 100 : 0
                const lowPct = b.skus > 0 ? (b.low / b.skus) * 100 : 0
                const criticalPct = b.skus > 0 ? (b.critical / b.skus) * 100 : 0
                const overallTone = b.critical > 0 ? 'red' : b.low > 0 ? 'amber' : 'green'
                const overallPct = ((b.healthy + b.low * 0.5) / Math.max(1, b.skus)) * 100
                return (
                  <tr key={b.brand} className="border-b border-[#F0EDE4]">
                    <td className="px-5 py-3 font-medium">{b.brand}</td>
                    <td className="px-3 py-3 text-[#3D3D3D]">{entityLabel}</td>
                    <td className="text-right px-3 py-3 font-mono">{b.skus}</td>
                    <td className="text-right px-3 py-3 font-mono text-[#4A6B3D]">{b.healthy}</td>
                    <td className={`text-right px-3 py-3 font-mono ${b.low > 0 ? 'text-[#A87B1F]' : 'text-[#6B6B6B]'}`}>{b.low}</td>
                    <td className={`text-right px-3 py-3 font-mono ${b.critical > 0 ? 'text-[#A53025]' : 'text-[#6B6B6B]'}`}>{b.critical}</td>
                    <td className="px-3 py-3">
                      <div className="h-1.5 bg-[#F0EDE4] rounded-full overflow-hidden flex">
                        <div className="h-full bg-[#4A6B3D]" style={{ width: `${healthyPct}%` }} />
                        <div className="h-full bg-[#A87B1F]" style={{ width: `${lowPct}%` }} />
                        <div className="h-full bg-[#A53025]" style={{ width: `${criticalPct}%` }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  )
}

// Compact money formatter: <1M shows K, >=1M shows M with 2 decimals.
// Used by all KPI cards on the dashboard so the format stays consistent.
function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return Math.round(n).toLocaleString('en-MY')
}

function KpiCard({ label, value, sub, accent, href }: { label: string; value: React.ReactNode; sub: string; accent: 'red' | 'amber' | 'black'; href?: string }) {
  const accentColor = accent === 'red' ? 'text-[#C8432C]' : accent === 'amber' ? 'text-[#A87B1F]' : 'text-[#1A1A1A]'
  const subColor = accent === 'red' ? 'text-[#C8432C]' : accent === 'amber' ? 'text-[#A87B1F]' : 'text-[#6B6B6B]'
  const body = (
    <>
      <div className="font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] mb-1.5">{label}</div>
      <div className={`text-2xl font-medium tracking-tight ${accentColor}`}>{value}</div>
      <div className={`text-[11px] mt-1 ${subColor}`}>{sub}</div>
    </>
  )
  if (href) {
    return <Link href={href} className="bg-white border border-[#D4D0C7] rounded-lg px-4 py-3.5 hover:border-[#1A1A1A] transition-colors block">{body}</Link>
  }
  return <div className="bg-white border border-[#D4D0C7] rounded-lg px-4 py-3.5">{body}</div>
}

function AgingRow({ label, value, pct, note, tone }: { label: string; value: number; pct: number; note: string; tone: 'green' | 'amber' | 'red' }) {
  const color = tone === 'green' ? '#4A6B3D' : tone === 'amber' ? '#A87B1F' : '#A53025'
  const noteColor = tone === 'green' ? 'text-[#4A6B3D]' : tone === 'amber' ? 'text-[#A87B1F]' : 'text-[#A53025]'
  const labelColor = tone === 'red' ? 'text-[#A53025] font-medium' : 'font-medium'
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <div className={`text-[13px] ${labelColor}`}>{label}</div>
        <div className="font-mono text-[13px]"><Sensitive>RM {value.toLocaleString('en-MY')}</Sensitive></div>
      </div>
      <div className="h-1.5 bg-[#F0EDE4] rounded-full overflow-hidden mb-1">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className={`font-mono text-[10px] ${noteColor}`}>{pct}% · {note}</div>
    </div>
  )
}
