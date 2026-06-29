import { supabaseAdmin } from '@/lib/supabase'
import { readFGStockByBrandSku, readFGIncomingByBrandSku } from '@/lib/fg-inventory'
import { fetchRecentStockMovements } from '@/lib/stock-movements'
import { AlertsTable } from '@/components/AlertsTable'
import { VISIBLE_BRANDS } from '@/lib/visible-brands'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Alert = {
  key: string
  type: 'low_stock' | 'expiry' | 'overdue' | 'packaging'
  subject: string
  sku?: string  // FG SKU for low_stock + expiry (powers Subject click-through)
  details: string
  details_sensitive?: string  // sensitive tail appended to details, masked via EyeToggle
  // Structured fields for low_stock alerts (rendered as their own columns
  // in AlertsTable instead of being concatenated into details).
  tier?: 'critical' | 'watch'
  on_hand?: number
  months_left?: number | null   // null = no velocity data
  avg_per_month?: number | null
  brand?: string                 // for the per-brand chip filter
  suggested_action: string
  delivered: string
  status: 'new' | 'acknowledged'
  // 'active' = should be acted on; 'processing' = PO already drafted/approved
  bucket: 'active' | 'processing'
  po_ref?: string // PO number if processing
}

const TRACKED_BRANDS = VISIBLE_BRANDS

export default async function AlertsPage() {
  let stockMap = new Map<string, number>()
  let incomingMap = new Map<string, number>()
  let fetchError: string | null = null
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
    { data: openPos },        // approved/received POs (incoming, awaiting delivery)
    { data: pendingPos },     // drafted but not yet approved
    { data: acks },
    { data: batches },        // for expiry alerts
    movements,                // for stock-months calculation (unified with Purchase Decisions)
    { data: settings },
    { data: brandSettings },  // per-brand critical_months thresholds
  ] = await Promise.all([
    supabaseAdmin.from('products').select('sku, brand, product_name, safety_stock_qty, moq, shelf_life_months, product_status, alert_critical_qty'),
    supabaseAdmin.from('purchase_orders').select('*, items:purchase_order_items(sku, qty)').in('status', ['approved']),
    supabaseAdmin.from('purchase_orders').select('*, items:purchase_order_items(sku, qty)').in('status', ['pending']),
    supabaseAdmin.from('alert_acknowledgements').select('*'),
    supabaseAdmin.from('batches').select('*').eq('status', 'active'),
    fetchRecentStockMovements(),
    supabaseAdmin.from('app_settings').select('*').eq('key', 'purchase_decision_thresholds').single(),
    supabaseAdmin.from('brand_alert_settings').select('brand, critical_months'),
  ])

  // Per-brand stock-months threshold. Brands NOT in this map have alerts
  // disabled entirely (e.g. NattomeSG, HeartioSG — we don't actively
  // restock them so noise from them isn't useful).
  const brandThresholds = new Map<string, number>()
  for (const r of (brandSettings || [])) {
    brandThresholds.set(r.brand, Number(r.critical_months) || 2.5)
  }

  // Unified stock-months calculation (same as Purchase Decisions)
  const th = (settings?.value as any) || { draft_po: 2.5, review: 3.5 }
  const DRAFT_THRESHOLD = Number(th.draft_po ?? 2.5)

  function monthKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const monthly = new Map<string, Map<string, number>>()
  for (const m of movements || []) {
    if (!m.sku || !m.date_start || !m.out_qty) continue
    const d = new Date(m.date_start)
    if (isNaN(d.getTime())) continue
    const k = `${m.brand}::${m.sku}`
    const mk = monthKey(d)
    if (!monthly.has(k)) monthly.set(k, new Map())
    monthly.get(k)!.set(mk, (monthly.get(k)!.get(mk) || 0) + Number(m.out_qty || 0))
  }
  function avgOver(brand: string, sku: string, months: number): number {
    const inner = monthly.get(`${brand}::${sku}`)
    if (!inner) return 0
    let sum = 0
    for (let i = 0; i < months; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i - 1, 1)
      sum += inner.get(monthKey(d)) || 0
    }
    return months > 0 ? sum / months : 0
  }
  // Matches Purchase Decisions basis logic: prefer L3M, then L6M, then LM.
  function basisAvg(brand: string, sku: string): number {
    const l3m = avgOver(brand, sku, 3)
    if (l3m > 0) return l3m
    const l6m = avgOver(brand, sku, 6)
    if (l6m > 0) return l6m
    return avgOver(brand, sku, 1)
  }

  const ackMap = new Map<string, any>((acks || []).map(a => [a.alert_key, a]))

  // Build: which SKUs have an active PO (pending or approved)
  const skusWithActivePO = new Map<string, string>() // sku → po_number
  for (const po of [...(openPos || []), ...(pendingPos || [])]) {
    for (const it of po.items || []) {
      if (it.sku && !skusWithActivePO.has(it.sku)) {
        skusWithActivePO.set(it.sku, po.po_number)
      }
    }
    // legacy top-level po.sku (if any)
    if (po.sku && !skusWithActivePO.has(po.sku)) skusWithActivePO.set(po.sku, po.po_number)
  }

  const alerts: Alert[] = []
  const today = new Date()

  // 1. LOW STOCK — per-brand stock-months threshold + per-SKU qty floor
  //    + the safety-stock fallback for SKUs with no sales history.
  //    Global <500/<1000 absolute rules are gone (too noisy for high-volume
  //    brands like HJT, too lenient for low-volume TPD-BRC SKUs).
  //
  //   • Brand not in brand_alert_settings → alerts disabled for that brand
  //   • Stock-months < brand-specific threshold → critical
  //   • Per-SKU alert_critical_qty set AND available < that qty → critical
  //   • safety_stock_qty set AND available < safety AND no movement history → critical
  //
  //   Watch tier removed — every alert is critical now.
  const isSachet = (sku: string | null | undefined) => !!sku && /sachet/i.test(sku)
  const INACTIVE_STATUSES = new Set(['discontinued', 'suspended', 'development'])
  for (const p of products || []) {
    if (!p.brand) continue
    const brandThreshold = brandThresholds.get(p.brand)
    if (brandThreshold == null) continue   // brand not configured → no alerts
    if (INACTIVE_STATUSES.has(p.product_status)) continue
    if (isSachet(p.sku)) continue
    const k = `${p.brand}::${p.sku}`
    const closing = stockMap.get(k) || 0
    const incoming = incomingMap.get(k) || 0
    const available = closing + incoming
    const safety = Number(p.safety_stock_qty) || 0
    const skuQtyFloor = p.alert_critical_qty != null ? Number(p.alert_critical_qty) : null
    const avg = basisAvg(p.brand, p.sku)
    const stockMonths = avg > 0 ? available / avg : 999

    let tier: 'critical' | null = null
    let reason = ''
    if (stockMonths < brandThreshold) {
      tier = 'critical'
      reason = `${stockMonths.toFixed(2)} months left (${p.brand} ≥${brandThreshold})`
    } else if (skuQtyFloor != null && available < skuQtyFloor) {
      tier = 'critical'
      reason = `below ${skuQtyFloor.toLocaleString()} (per-SKU floor)`
    } else if (safety > 0 && available < safety && avg === 0) {
      tier = 'critical'
      reason = `below safety ${safety.toLocaleString()}`
    }

    if (tier) {
      const key = `lowstock-${p.brand}-${p.sku}`
      const ack = ackMap.get(key)
      const activePo = skusWithActivePO.get(p.sku)
      const tierTag = '🔴 CRITICAL'
      // Legacy combined string kept as fallback (and for other consumers
      // that haven't migrated to the structured fields yet).
      const detail = `${tierTag} · ${closing.toLocaleString()} on hand · ${reason}${incoming > 0 ? ` (+${incoming.toLocaleString()} incoming)` : ''}`
      const detail_sensitive = avg > 0 ? `avg ${Math.round(avg)}/mo` : undefined
      alerts.push({
        key,
        type: 'low_stock',
        subject: p.product_name || p.sku,
        sku: p.sku,
        brand: p.brand,
        details: detail,
        details_sensitive: detail_sensitive,
        tier,
        on_hand: closing,
        months_left: avg > 0 ? stockMonths : null,
        avg_per_month: avg > 0 ? avg : null,
        suggested_action: activePo
          ? `PO ${activePo} in progress`
          : `Order ${Number(p.moq) || 'MOQ'} units`,
        delivered: 'EMAIL + WA',
        status: ack?.status || 'new',
        bucket: activePo ? 'processing' : 'active',
        po_ref: activePo,
      })
    }
  }

  // 2. OVERDUE PO (approved POs past ETA)
  for (const po of openPos || []) {
    if (!po.expected_date) continue
    const expected = new Date(po.expected_date)
    if (isNaN(expected.getTime())) continue
    const daysOver = Math.floor((today.getTime() - expected.getTime()) / 86400000)
    if (daysOver > 0) {
      const key = `overdue-${po.po_number}`
      const ack = ackMap.get(key)
      const firstItem = (po.items || [])[0]
      const desc = firstItem ? `${firstItem.product_name || firstItem.sku || ''} × ${Number(firstItem.qty).toLocaleString()}` : ''
      alerts.push({
        key,
        type: 'overdue',
        subject: po.po_number,
        details: `${desc} · ${daysOver} day${daysOver > 1 ? 's' : ''} overdue`,
        suggested_action: `Follow up with ${po.supplier_name}`,
        delivered: 'EMAIL + WA',
        status: ack?.status || 'new',
        bucket: 'active',
        po_ref: po.po_number,
      })
    }
  }

  // 3. EXPIRY — batches expiring within 90 days or already expired
  const productByKey = new Map<string, any>((products || []).map((p: any) => [`${p.brand}::${p.sku}`, p]))
  for (const b of batches || []) {
    if (!b.expiry_date) continue
    if (isSachet(b.sku)) continue
    const expiry = new Date(b.expiry_date)
    if (isNaN(expiry.getTime())) continue
    const daysUntil = Math.floor((expiry.getTime() - today.getTime()) / 86400000)
    // Only alert when within 12 months or already expired
    if (daysUntil > 365) continue

    const product = productByKey.get(`${b.brand}::${b.sku}`) || null
    const productName = product?.product_name || b.sku
    const key = `expiry-${b.sku}-${b.batch_number}`
    const ack = ackMap.get(key)
    const qtyRemaining = Number(b.qty_remaining ?? b.qty) || 0

    // Format remaining time as months/days for readability
    const monthsLeft = Math.floor(daysUntil / 30)
    const timeLabel = daysUntil < 0
      ? `expired ${Math.abs(daysUntil)} day${Math.abs(daysUntil) > 1 ? 's' : ''} ago`
      : monthsLeft >= 1
        ? `expires in ${monthsLeft} month${monthsLeft > 1 ? 's' : ''} (${daysUntil} days)`
        : `expires in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`

    let action: string
    if (daysUntil < 0) {
      action = '🚨 Remove from inventory or recall'
    } else if (daysUntil < 90) {
      action = '⚠ Urgent — prioritise clearance / discount'
    } else if (daysUntil < 180) {
      action = '6-month watch — push to pharmacy / B2B channel'
    } else if (daysUntil < 270) {
      action = '9-month watch — plan promo campaign'
    } else {
      action = '12-month watch — monitor velocity'
    }
    const details = `Batch ${b.batch_number} · ${qtyRemaining.toLocaleString()} units · ${timeLabel}`

    alerts.push({
      key,
      type: 'expiry',
      subject: productName,
      sku: b.sku,
      brand: b.brand || product?.brand,
      details,
      suggested_action: action,
      delivered: 'EMAIL',
      status: ack?.status || 'new',
      bucket: 'active',
    })
  }

  // Dedupe by key (safety net — keys should already be unique by construction,
  // but if a product accidentally has duplicate (brand, sku) we don't want
  // double counts vs. visible rows in the table).
  const seen = new Set<string>()
  const dedupedAlerts: Alert[] = []
  for (const a of alerts) {
    if (seen.has(a.key)) continue
    seen.add(a.key)
    dedupedAlerts.push(a)
  }
  alerts.length = 0
  alerts.push(...dedupedAlerts)

  // Sort: new first, then acknowledged
  const order = { new: 0, acknowledged: 1 }
  alerts.sort((a, b) => order[a.status] - order[b.status])

  // Only show alerts that still need action. Once a SKU has a PO drafted
  // or approved, it's no longer an alert — it's in the PO workflow.
  const activeAlerts = alerts.filter(a => a.bucket === 'active')
  const processingAlerts: Alert[] = [] // intentionally empty — Processing tab removed

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">Alerts</strong>
        </div>
        <div className="flex gap-2.5 items-center">
          <input
            type="text"
            placeholder="Search..."
            className="bg-[#FAFAF7] border border-[#D4D0C7] rounded px-3 py-1.5 text-[13px] w-[300px] focus:outline-none focus:border-[#C8432C]"
          />
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">
              System notifications
            </div>
            <h1 className="text-3xl font-medium tracking-tight">Alerts</h1>
            <div className="text-sm text-[#6B6B6B] mt-1">
              {activeAlerts.filter(a => a.status === 'new').length} new · {activeAlerts.length} active · {processingAlerts.length} processing
            </div>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[13px] hover:bg-[#FAFAF7]">
              Mark all read
            </button>
            <button className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[13px] hover:bg-[#FAFAF7]">
              Settings
            </button>
          </div>
        </div>

        {fetchError ? (
          <div className="p-4 bg-[#F5DEDA] border border-[#A53025] rounded text-[#A53025] mb-4">
            <strong>Error:</strong> {fetchError}
          </div>
        ) : null}

        <AlertsTable activeAlerts={activeAlerts} processingAlerts={processingAlerts} />
      </div>
    </div>
  )
}
