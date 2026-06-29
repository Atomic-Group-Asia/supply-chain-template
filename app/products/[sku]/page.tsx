import { supabaseAdmin } from '@/lib/supabase'
import { ProductDetailTabs } from '@/components/ProductDetailTabs'
import { readFGStockByBrandSku } from '@/lib/fg-inventory'
import { notFound } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ENTITY_NAME: Record<string, string> = {
  '1PCT': '1PCT Daily Management Sdn Bhd',
  NAT: 'Nattome Sdn Bhd',
  HRT: 'The Perfect Series Sdn Bhd',
}
const BRAND_TO_ENTITY: Record<string, string> = {
  TPD: '1PCT',
  HooHoo: '1PCT',
  Stonecare: '1PCT',
  Nattome: 'NAT',
  Heartio: 'HRT',
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function ProductDetailPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params
  const decodedSku = decodeURIComponent(sku)

  const { data: product } = await supabaseAdmin
    .from('products').select('*').eq('sku', decodedSku).single()

  if (!product) notFound()

  // Live stock from GSheet (FG Inventory)
  let openingStock = 0
  let stockErr: string | null = null
  try {
    const stockMap = await readFGStockByBrandSku()
    openingStock = stockMap.get(`${product.brand}::${decodedSku}`) || 0
  } catch (e: any) {
    stockErr = e.message
  }

  const [
    { data: bom },
    { data: suppliers },
    { data: packaging },
    { data: pos },
    { data: commitments },
    { data: movements },
  ] = await Promise.all([
    supabaseAdmin.from('bom').select('*').eq('product_sku', decodedSku),
    supabaseAdmin.from('suppliers').select('*').order('supplier_code'),
    supabaseAdmin.from('packaging').select('*').order('packaging_code'),
    supabaseAdmin.from('purchase_orders').select('*, items:purchase_order_items(*)').order('created_at', { ascending: false }),
    supabaseAdmin.from('stock_commitments').select('*').eq('product_sku', decodedSku).order('required_by_date', { ascending: true, nullsFirst: false }),
    supabaseAdmin
      .from('stock_movements')
      .select('*')
      .eq('sku', decodedSku)
      .gte('date_start', new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .order('date_start', { ascending: false }),
  ])

  // Filter POs that contain this SKU as a line item (or top-level legacy SKU match)
  const skuPos = (pos || []).filter((po: any) => {
    if (po.sku === decodedSku) return true
    return (po.items || []).some((it: any) => it.sku === decodedSku)
  })

  // Compute incoming (qty from approved POs not yet received) — sum line items matching this SKU
  let incomingQty = 0
  let incomingPoLabel = ''
  let incomingEta: string | null = null
  for (const po of skuPos) {
    if (po.status !== 'approved' && po.status !== 'pending') continue
    const matchedItems = (po.items || []).filter((it: any) => it.sku === decodedSku)
    let qty = matchedItems.reduce((s: number, it: any) => s + Number(it.qty || 0), 0)
    if (qty === 0 && po.sku === decodedSku) qty = Number(po.qty || 0)
    incomingQty += qty
    if (!incomingPoLabel && qty > 0) {
      incomingPoLabel = po.po_number
      incomingEta = po.expected_date
    }
  }

  // Compute committed (open commitments)
  let committedQty = 0
  let committedDesc = ''
  for (const c of commitments || []) {
    if (c.status === 'fulfilled' || c.status === 'cancelled') continue
    committedQty += Number(c.qty || 0)
  }
  if (commitments && commitments.length > 0) {
    const live = commitments.filter((c: any) => c.status !== 'fulfilled' && c.status !== 'cancelled')
    const byType: Record<string, number> = {}
    for (const c of live) {
      const t = c.commitment_type || 'other'
      byType[t] = (byType[t] || 0) + 1
    }
    committedDesc = Object.entries(byType).map(([k, v]) => `${v} ${k}`).join(' + ')
  }

  const availableQty = openingStock + incomingQty - committedQty

  // Sales velocity: aggregate OUT qty per month
  const monthly = new Map<string, number>()
  for (const m of movements || []) {
    if (!m.date_start || !m.out_qty) continue
    const d = new Date(m.date_start)
    if (isNaN(d.getTime())) continue
    const mk = monthKey(d)
    monthly.set(mk, (monthly.get(mk) || 0) + Number(m.out_qty || 0))
  }
  const today = new Date()
  function avgOver(months: number): number {
    let sum = 0
    for (let i = 0; i < months; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i - 1, 1)
      sum += monthly.get(monthKey(d)) || 0
    }
    return months > 0 ? sum / months : 0
  }
  const lm = avgOver(1)
  const l3m = avgOver(3)
  const l6m = avgOver(6)
  const basis = l3m > 0 ? l3m : l6m > 0 ? l6m : lm
  const stockMonths = basis > 0 ? availableQty / basis : 999

  // Trend label vs L3M
  let trendLabel = ''
  if (l3m > 0) {
    const delta = (lm - l3m) / l3m
    if (delta > 0.05) trendLabel = '↑ vs L3M avg'
    else if (delta < -0.05) trendLabel = '↓ vs L3M avg'
    else trendLabel = '→ vs L3M avg'
  }
  let velocityNote = 'steady demand'
  if (basis > 0) {
    if (stockMonths < 1) velocityNote = '⚠ critical — under 1 month'
    else if (stockMonths < 2.5) velocityNote = 'low — draft PO suggested'
    else if (stockMonths > 6) velocityNote = 'overstocked'
    else velocityNote = 'healthy'
  }

  const packagingByCode: Record<string, any> = {}
  for (const p of packaging || []) packagingByCode[p.packaging_code] = p

  const entity = BRAND_TO_ENTITY[product.brand] || ''
  const entityName = ENTITY_NAME[entity] || ''
  const safety = Number(product.safety_stock_qty) || 0

  const stockInfo = {
    openingStock,
    openingDateLabel: stockErr ? 'GSheet unavailable' : `as of ${new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' })}`,
    incomingQty,
    incomingPoLabel,
    incomingEta,
    committedQty,
    committedDesc,
    availableQty,
    safety,
    healthLabel: availableQty >= safety ? `healthy vs safety: ${safety.toLocaleString()}` : `⚠ below safety ${safety.toLocaleString()}`,
    isHealthy: availableQty >= safety,
  }

  const velocityInfo = {
    lm: Math.round(lm),
    l3m: Math.round(l3m),
    l6m: Math.round(l6m),
    stockMonths: Number(stockMonths.toFixed(2)),
    trendLabel,
    velocityNote,
    available: availableQty,
  }

  const supplierMap: Record<string, string> = {}
  for (const s of suppliers || []) supplierMap[s.supplier_code] = s.supplier_name

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <Link href="/products" className="hover:text-[#1A1A1A]">Products</Link>
          {product.brand && (
            <> · <Link href={`/products?brand=${encodeURIComponent(product.brand)}`} className="hover:text-[#1A1A1A]">{product.brand}</Link></>
          )}
          {' · '}<strong className="text-[#1A1A1A]">{product.sku}</strong>
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">
              {product.sku} · {product.brand?.toUpperCase() || '—'}
            </div>
            <h1 className="text-3xl font-medium tracking-tight">{product.product_name}</h1>
          </div>
        </div>

        <ProductDetailTabs
          product={product}
          bom={bom || []}
          suppliers={suppliers || []}
          packaging={packaging || []}
          packagingByCode={packagingByCode}
          stockInfo={stockInfo}
          velocityInfo={velocityInfo}
          entity={entity}
          entityName={entityName}
          supplierMap={supplierMap}
          pos={skuPos}
          commitments={commitments || []}
          movements={movements || []}
        />
      </div>
    </div>
  )
}
