import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { BatchesPanel } from '@/components/BatchesPanel'
import { readSkuMapping, readDailyStockAllBrands } from '@/lib/fg-inventory'
import { reconcileSkuBatches } from '@/lib/batch-reconcile'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function FGInventoryDetailPage({ params }: { params: Promise<{ brand: string; sku: string }> }) {
  const { brand: brandRaw, sku: skuRaw } = await params
  const brand = decodeURIComponent(brandRaw)
  const sku = decodeURIComponent(skuRaw)

  // Auto-reconcile batches against the current daily_stock_current value
  // so qty_remaining always reflects "Available" before we render. Errors
  // here are non-fatal (page still renders with stale data).
  try { await reconcileSkuBatches(brand, sku) } catch {}

  const [{ data: product }, { data: batches }, mapping, { data: incomingPOs }, stockMap, { data: movements }] = await Promise.all([
    supabaseAdmin.from('products').select('*').eq('brand', brand).eq('sku', sku).maybeSingle(),
    supabaseAdmin
      .from('batches').select('*')
      .eq('brand', brand).eq('sku', sku)
      .order('expiry_date', { ascending: true }),
    readSkuMapping(),
    // Incoming PO lines for this SKU: approved or partial_received only
    // (pending POs don't count toward Incoming). Sorted by ETA ascending
    // so user sees soonest shipment first.
    supabaseAdmin
      .from('purchase_order_items')
      .select('id, qty, received_qty, expected_date, po:purchase_orders!inner(id, po_number, expected_date, status, po_type)')
      .eq('sku', sku)
      .eq('brand', brand),
    // Authoritative Available — same source FG Inventory list uses, so
    // the number on the detail page always matches the list. Respects
    // AVAILABLE_SOURCE env (daily_stock_current on prod, gsheet on demo).
    readDailyStockAllBrands(),
    // Stock movements for this SKU — monthly ledger imported from
    // Excel/CSV uploads. Filtered to this (brand, sku) so the per-SKU
    // queries stay well under the 1000-row cap.
    supabaseAdmin
      .from('stock_movements')
      .select('*')
      .eq('brand', brand)
      .eq('sku', sku)
      .order('date_start', { ascending: false }),
  ])

  const available = stockMap.get(`${brand}::${sku}`) || 0

  // Filter & shape PO lines into incoming shipments. ETA comes from the
  // line first, fallback to the PO header — so a multi-batch PO can show
  // each shipment's own arrival date.
  type IncomingRow = { po_id: string; po_number: string; expected_date: string | null; eta_source: 'line' | 'header' | 'none'; ordered: number; received: number; remaining: number }
  const incomingRows: IncomingRow[] = []
  for (const row of (incomingPOs || []) as any[]) {
    const po = row.po
    if (!po || po.po_type !== 'FG') continue
    if (po.status !== 'approved' && po.status !== 'partial_received') continue
    const ordered = Number(row.qty) || 0
    const received = Number(row.received_qty) || 0
    const remaining = Math.max(0, ordered - received)
    if (remaining <= 0) continue
    const lineEta = row.expected_date as string | null
    const headerEta = po.expected_date as string | null
    const eta = lineEta || headerEta
    const eta_source: IncomingRow['eta_source'] = lineEta ? 'line' : headerEta ? 'header' : 'none'
    incomingRows.push({
      po_id: po.id,
      po_number: po.po_number,
      expected_date: eta,
      eta_source,
      ordered, received, remaining,
    })
  }
  incomingRows.sort((a, b) => {
    const ad = a.expected_date || '9999-12-31'
    const bd = b.expected_date || '9999-12-31'
    return ad.localeCompare(bd)
  })
  const totalIncoming = incomingRows.reduce((s, r) => s + r.remaining, 0)

  // Fall back to SKU Mapping gsheet for SKUs not in the Products master.
  const mappingHit = mapping.find(m => m.sku === sku && m.brand === brand)
  const productOrMapping: any = product || (mappingHit && {
    sku: mappingHit.sku,
    brand: mappingHit.brand,
    product_name: mappingHit.product_name,
    safety_stock_qty: null,
  })
  if (!productOrMapping) notFound()

  const active = (batches || []).filter(b => b.status === 'active' && (Number(b.qty_remaining) || 0) > 0)
  const batchSum = active.reduce((s, b) => s + (Number(b.qty_remaining) || 0), 0)
  const earliest = active[0]?.expiry_date || null

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <Link href="/fg-inventory" className="hover:underline">FG Inventory</Link> · <Link href={`/fg-inventory?brand=${encodeURIComponent(brand)}`} className="hover:underline">{brand}</Link> · <strong className="text-[#1A1A1A]">{sku}</strong>
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">
              {brand} · FG SKU
            </div>
            <h1 className="text-3xl font-medium tracking-tight">{productOrMapping.product_name || sku}</h1>
            <div className="text-sm text-[#6B6B6B] mt-1 font-mono">{sku}</div>
          </div>
          <Link href="/fg-inventory" className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[13px] hover:bg-[#FAFAF7]">
            ← Back to inventory
          </Link>
        </div>

        {/* Stock summary */}
        <div className="bg-white border border-[#D4D0C7] rounded-lg p-6 mb-6 grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-8">
          <Cell label="Available">
            <div className="font-mono text-[20px] font-semibold">{available.toLocaleString()}</div>
          </Cell>
          <Cell label="Active Batches">
            <div className="font-mono text-[20px] font-semibold">{active.length}</div>
          </Cell>
          <Cell label="Earliest Expiry">
            <div className="font-mono text-[14px]">{earliest || '—'}</div>
          </Cell>
          <Cell label="Safety Stock">
            <div className="font-mono text-[14px]">{productOrMapping.safety_stock_qty?.toLocaleString() || '—'}</div>
          </Cell>
        </div>

        {/* Incoming shipments — per-PO breakdown with ETA (different
         *  batches arriving on different dates). Approved + partial only. */}
        <div className="bg-white border border-[#D4D0C7] rounded-lg overflow-hidden mb-6">
          <div className="px-5 py-3.5 bg-[#FAFAF7] border-b border-[#D4D0C7] flex items-center justify-between">
            <div className="font-medium text-[15px]">
              Incoming Shipments ({incomingRows.length})
            </div>
            <div className="font-mono text-[11px] text-[#6B6B6B]">
              Total incoming: <strong className="text-[#4A6B3D]">+{totalIncoming.toLocaleString()}</strong>
            </div>
          </div>
          {incomingRows.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13px] text-[#6B6B6B]">
              No incoming POs for this SKU (only approved / partial_received are shown).
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-[#FAFAF7] border-b border-[#E8E5DE]">
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
                  <th className="px-5 py-2.5">PO #</th>
                  <th className="px-5 py-2.5">SKU</th>
                  <th className="px-5 py-2.5">Product</th>
                  <th className="px-5 py-2.5 text-right">Incoming Qty</th>
                  <th className="px-5 py-2.5">ETA</th>
                </tr>
              </thead>
              <tbody>
                {incomingRows.map(r => (
                  <tr key={r.po_id} className="border-b border-[#F0EDE4] last:border-0 hover:bg-[#FAFAF7]">
                    <td className="px-5 py-2.5">
                      <Link href={`/purchase-orders/${r.po_id}`} className="font-mono text-[12px] text-[#C8432C] hover:underline">
                        {r.po_number}
                      </Link>
                    </td>
                    <td className="px-5 py-2.5 font-mono text-[12px]">{sku}</td>
                    <td className="px-5 py-2.5">{productOrMapping.product_name || sku}</td>
                    <td className="px-5 py-2.5 text-right font-mono">
                      <span className="font-semibold text-[#4A6B3D]">+{r.remaining.toLocaleString()}</span>
                      {r.received > 0 && (
                        <div className="text-[10px] text-[#6B6B6B]">
                          {r.received.toLocaleString()} / {r.ordered.toLocaleString()} received
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-[12px]">
                      {r.expected_date
                        ? (
                            <span className={r.eta_source === 'header' ? 'text-[#6B6B6B]' : 'text-[#1A1A1A]'} title={r.eta_source === 'header' ? 'Inherited from PO header' : 'Per-line ETA'}>
                              {r.expected_date}
                              {r.eta_source === 'header' && <span className="text-[9px] ml-1">(hdr)</span>}
                            </span>
                          )
                        : <span className="text-[#6B6B6B] italic">no ETA</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <BatchesPanel batches={(batches || []) as any} brand={brand} sku={sku} />

        {/* Stock movements ledger — monthly in/out from the Excel uploads */}
        <div className="bg-white border border-[#D4D0C7] rounded-lg overflow-hidden mt-6">
          <div className="px-5 py-3.5 bg-[#FAFAF7] border-b border-[#D4D0C7] flex items-center justify-between">
            <div className="font-medium text-[15px]">
              Stock Movements ({(movements || []).length})
            </div>
            <div className="font-mono text-[10px] text-[#6B6B6B] uppercase tracking-wider">
              Monthly ledger · latest first
            </div>
          </div>
          {(!movements || movements.length === 0) ? (
            <div className="px-5 py-10 text-center text-[13px] text-[#6B6B6B]">
              No movement records for this SKU yet.
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-[#FAFAF7] border-b border-[#E8E5DE]">
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
                  <th className="px-5 py-2.5">Period</th>
                  <th className="px-5 py-2.5 text-right">Opening</th>
                  <th className="px-5 py-2.5 text-right">In</th>
                  <th className="px-5 py-2.5 text-right">Out</th>
                  <th className="px-5 py-2.5 text-right">Closing</th>
                  <th className="px-5 py-2.5">Warehouse</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m: any) => (
                  <tr key={m.id} className="border-b border-[#F0EDE4] last:border-0 hover:bg-[#FAFAF7]">
                    <td className="px-5 py-2.5 font-mono text-[11px]">
                      {m.date_start || '—'}
                      {m.date_end && m.date_end !== m.date_start && (
                        <span className="text-[#6B6B6B]"> → {m.date_end}</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono">{m.starting != null ? Number(m.starting).toLocaleString() : '—'}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-[#4A6B3D]">
                      {m.in_qty != null && Number(m.in_qty) > 0 ? `+${Number(m.in_qty).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono text-[#C8432C]">
                      {m.out_qty != null && Number(m.out_qty) > 0 ? `−${Number(m.out_qty).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono font-semibold">
                      {m.closing != null ? Number(m.closing).toLocaleString() : '—'}
                    </td>
                    <td className="px-5 py-2.5 text-[11px] text-[#6B6B6B]">{m.warehouse || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1.5 font-semibold">{label}</div>
      <div>{children}</div>
    </div>
  )
}
