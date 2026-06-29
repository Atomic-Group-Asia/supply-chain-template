import { supabaseAdmin } from '@/lib/supabase'
import { PackagingDetailTabs } from '@/components/PackagingDetailTabs'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function PackagingDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const decoded = decodeURIComponent(code)

  const { data: packaging } = await supabaseAdmin
    .from('packaging').select('*').eq('packaging_code', decoded).single()

  if (!packaging) notFound()

  const [
    { data: bomUsage },
    { data: suppliers },
    { data: pos },
    { data: movements },
  ] = await Promise.all([
    // Which FG SKUs use this packaging?
    supabaseAdmin
      .from('bom')
      .select('product_sku, qty_per_unit, type, source, notes')
      .eq('packaging_code', decoded),
    supabaseAdmin.from('suppliers').select('*').order('supplier_code'),
    supabaseAdmin
      .from('purchase_orders')
      .select('*, items:purchase_order_items(*)')
      .order('created_at', { ascending: false }),
    // Recent consumption ledger (auto-deducted on FG PO receipt)
    supabaseAdmin
      .from('packaging_movements')
      .select('*')
      .eq('packaging_code', decoded)
      .order('created_at', { ascending: false })
      .limit(30),
  ])

  // Get product info for each FG using this packaging
  const fgSkus = (bomUsage || []).map((b: any) => b.product_sku)
  const { data: fgProducts } = fgSkus.length > 0
    ? await supabaseAdmin.from('products').select('sku, product_name, brand').in('sku', fgSkus)
    : { data: [] }

  const fgMap: Record<string, any> = {}
  for (const p of fgProducts || []) fgMap[p.sku] = p

  // Filter POs containing this packaging code as line item
  const pkgPos = (pos || []).filter((po: any) => {
    return (po.items || []).some((it: any) => it.sku === decoded)
  })

  // ============ STOCK POSITION ============
  // Opening Stock from GSheet (packaging.stock_balance), already in the
  // packaging master's UOM (e.g., "Unit" for Foil where 1 Unit = 15 pcs).
  // No multiplication — labels everywhere use the master's UOM so the user
  // reads the same value end-to-end without unit conversion surprises.
  const pkgPackSize = Number(packaging.pack_size) || 1
  const openingStock = Number(packaging.stock_balance) || 0
  const openingNote = packaging.stock_balance == null
    ? 'No stock_balance in GSheet'
    : `From GSheet (${packaging.uom || 'pc'})`

  // Incoming: live from open Packaging POs (pending + approved).
  // PO lines are summed in the line UOM. When a line is in the "outer" pack
  // (Roll/Pack/Box), we convert it to the inner master UOM by multiplying by
  // pack_size — so stocks + incoming line up under the same label.
  let incomingQty = 0
  let incomingPoLabel = ''
  let incomingEta: string | null = null
  for (const po of pkgPos) {
    if (po.po_type !== 'Packaging') continue
    if (po.status !== 'approved' && po.status !== 'pending') continue
    const matchedItems = (po.items || []).filter((it: any) => it.sku === decoded)
    for (const it of matchedItems) {
      const lineQty = Number(it.qty || 0)
      const lineUom = (it.uom || '').toLowerCase()
      const isOuterLine = /roll|pack|box|carton/.test(lineUom)
      // Convert outer-pack lines to the master inner UOM
      const inInner = isOuterLine && pkgPackSize > 1 ? lineQty * pkgPackSize : lineQty
      incomingQty += inInner
    }
    if (!incomingPoLabel && matchedItems.length > 0) {
      incomingPoLabel = po.po_number
      incomingEta = po.expected_date
    }
  }

  // Committed: ONLY from stock_commitments table — same rule as FG inventory.
  // We do NOT infer demand from FG POs × BOM here (user explicitly wants the
  // system to show only real recorded data, not derived numbers).
  const { data: pkgCommitments } = await supabaseAdmin
    .from('stock_commitments')
    .select('qty, status')
    .eq('sku', decoded)
    .eq('status', 'active')
  let committedQty = 0
  for (const c of pkgCommitments || []) committedQty += Number(c.qty || 0)
  const committedDesc = committedQty > 0
    ? `${(pkgCommitments || []).length} active commitment${(pkgCommitments || []).length > 1 ? 's' : ''}`
    : 'No active commitments'

  const availableQty = openingStock + incomingQty - committedQty
  const moq = Number(packaging.moq) || 0
  const isHealthy = availableQty >= moq

  // Inner unit name from packaging master (defaults to 'pc').
  // For Foil with uom='Unit', everything is counted in those units —
  // not raw pcs. The display follows the master so users see consistent labels.
  const innerUomName = (packaging.uom && String(packaging.uom).trim()) || 'pc'
  const outerUomName = /foil/i.test(packaging.packaging_type || '') ? 'Roll' : 'Pack'

  // Helper: inner-unit value → outer pack display (e.g. "2,346 Unit (4.40 Rolls)")
  function pcsLabel(qty: number): { primary: string; secondary: string } {
    if (pkgPackSize > 1) {
      const outer = qty / pkgPackSize
      const outerStr = Number.isInteger(outer) ? outer.toLocaleString() : outer.toFixed(2)
      return {
        primary: `${qty.toLocaleString()} ${innerUomName}`,
        secondary: `${outerStr} ${outerUomName}${outer === 1 ? '' : 's'}`,
      }
    }
    return { primary: `${qty.toLocaleString()} ${innerUomName}`, secondary: '' }
  }

  // ============ USAGE VELOCITY (consumed from FG sales) ============
  // For each FG using this packaging, get its L3M sales × qty_per_unit
  let weightedL1 = 0, weightedL3 = 0, weightedL6 = 0
  if (fgSkus.length > 0) {
    const { data: movements } = await supabaseAdmin
      .from('stock_movements')
      .select('sku, date_start, out_qty')
      .in('sku', fgSkus)
      .gte('date_start', new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))

    // Aggregate OUT qty per (sku, month)
    const monthly = new Map<string, Map<string, number>>()
    for (const m of movements || []) {
      if (!m.sku || !m.date_start || !m.out_qty) continue
      const d = new Date(m.date_start)
      if (isNaN(d.getTime())) continue
      const mk = monthKey(d)
      if (!monthly.has(m.sku)) monthly.set(m.sku, new Map())
      monthly.get(m.sku)!.set(mk, (monthly.get(m.sku)!.get(mk) || 0) + Number(m.out_qty || 0))
    }

    const today = new Date()
    function avgFor(sku: string, months: number): number {
      const inner = monthly.get(sku)
      if (!inner) return 0
      let sum = 0
      for (let i = 0; i < months; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() - i - 1, 1)
        sum += inner.get(monthKey(d)) || 0
      }
      return months > 0 ? sum / months : 0
    }

    for (const b of bomUsage || []) {
      const qtyPerUnit = Number(b.qty_per_unit) || 0
      weightedL1 += avgFor(b.product_sku, 1) * qtyPerUnit
      weightedL3 += avgFor(b.product_sku, 3) * qtyPerUnit
      weightedL6 += avgFor(b.product_sku, 6) * qtyPerUnit
    }
  }

  const basis = weightedL3 > 0 ? weightedL3 : weightedL6 > 0 ? weightedL6 : weightedL1
  const stockMonths = basis > 0 ? availableQty / basis : 999
  let velocityNote = 'no usage data'
  if (basis > 0) {
    if (stockMonths < 1) velocityNote = '⚠ critical — under 1 month'
    else if (stockMonths < 2.5) velocityNote = 'low — draft packaging PO suggested'
    else if (stockMonths > 6) velocityNote = 'overstocked'
    else velocityNote = 'healthy'
  }

  // Trend label
  let trendLabel = ''
  if (weightedL3 > 0) {
    const delta = (weightedL1 - weightedL3) / weightedL3
    if (delta > 0.05) trendLabel = '↑ vs L3M avg'
    else if (delta < -0.05) trendLabel = '↓ vs L3M avg'
    else trendLabel = '→ vs L3M avg'
  }

  const supplierMap: Record<string, string> = {}
  for (const s of suppliers || []) supplierMap[s.supplier_code] = s.supplier_name

  const openingLabel = pcsLabel(openingStock)
  const incomingLabel = pcsLabel(incomingQty)
  const committedLabel = pcsLabel(committedQty)
  const availableLabel = pcsLabel(availableQty)

  const stockInfo = {
    openingStock,
    openingLabelPrimary: openingLabel.primary,
    openingLabelSecondary: openingLabel.secondary,
    openingNote,
    incomingQty,
    incomingLabelPrimary: incomingLabel.primary,
    incomingLabelSecondary: incomingLabel.secondary,
    incomingPoLabel,
    incomingEta,
    committedQty,
    committedLabelPrimary: committedLabel.primary,
    committedLabelSecondary: committedLabel.secondary,
    committedDesc,
    availableQty,
    availableLabelPrimary: availableLabel.primary,
    availableLabelSecondary: availableLabel.secondary,
    moq,
    packSize: pkgPackSize,
    innerUom: innerUomName,
    outerUom: outerUomName,
    healthLabel: isHealthy ? `healthy vs MOQ: ${moq.toLocaleString()}` : `⚠ below MOQ ${moq.toLocaleString()}`,
    isHealthy,
  }

  const velocityInfo = {
    lm: Math.round(weightedL1),
    l3m: Math.round(weightedL3),
    l6m: Math.round(weightedL6),
    stockMonths: Number(stockMonths.toFixed(2)),
    trendLabel,
    velocityNote,
    available: availableQty,
  }

  // FG users with details
  const fgUsers = (bomUsage || []).map((b: any) => ({
    product_sku: b.product_sku,
    product_name: fgMap[b.product_sku]?.product_name || b.product_sku,
    brand: fgMap[b.product_sku]?.brand || '',
    qty_per_unit: b.qty_per_unit,
    notes: b.notes,
  }))

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <Link href="/packaging" className="hover:text-[#1A1A1A]">Packaging</Link>
          {packaging.brand && (
            <> · <Link href={`/packaging?brand=${encodeURIComponent(packaging.brand)}`} className="hover:text-[#1A1A1A]">{packaging.brand}</Link></>
          )}
          {' · '}<strong className="text-[#1A1A1A]">{packaging.packaging_code}</strong>
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">
              {packaging.packaging_code} · {(packaging.packaging_type || 'PACKAGING').toUpperCase()}
            </div>
            <h1 className="text-3xl font-medium tracking-tight">{packaging.packaging_name || packaging.packaging_code}</h1>
          </div>
        </div>

        <PackagingDetailTabs
          packaging={packaging}
          suppliers={suppliers || []}
          stockInfo={stockInfo}
          velocityInfo={velocityInfo}
          fgUsers={fgUsers}
          pos={pkgPos}
          supplierMap={supplierMap}
          movements={movements || []}
        />
      </div>
    </div>
  )
}
