import { supabaseAdmin } from '@/lib/supabase'
import { SyncButton } from '@/components/SyncButton'
import { PackagingTable } from '@/components/PackagingTable'
import { CreatePackagingButton } from '@/components/CreatePackagingButton'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PackagingPage() {
  const [{ data: packaging }, { data: suppliers }, { data: bom }, { data: openPkgPos }] = await Promise.all([
    supabaseAdmin.from('packaging').select('*').order('packaging_code'),
    supabaseAdmin.from('suppliers').select('*').order('supplier_code'),
    supabaseAdmin.from('bom').select('packaging_code, qty_per_unit'),
    // Open Packaging POs — used to compute live `incoming` per packaging_code.
    supabaseAdmin
      .from('purchase_orders')
      .select('items:purchase_order_items(sku, qty, received_qty)')
      .eq('po_type', 'Packaging')
      .in('status', ['pending', 'approved', 'partial_received']),
  ])

  // Build map: packaging_code → most common qty_per_unit (mode)
  // Used to display "Cost per FG unit" for bulk packs (Foil etc.)
  const bomQtyByCode: Record<string, number> = {}
  const countsByCode: Record<string, Record<string, number>> = {}
  for (const b of bom || []) {
    if (!b.packaging_code) continue
    const qty = String(Number(b.qty_per_unit) || 0)
    countsByCode[b.packaging_code] = countsByCode[b.packaging_code] || {}
    countsByCode[b.packaging_code][qty] = (countsByCode[b.packaging_code][qty] || 0) + 1
  }
  for (const code in countsByCode) {
    const entries = Object.entries(countsByCode[code]).sort((a, b) => b[1] - a[1])
    if (entries[0]) bomQtyByCode[code] = Number(entries[0][0])
  }

  // Live incoming map (replaces the GSheet-driven value).
  // Sum of open Packaging-PO line REMAINING qty (ordered − received) per packaging_code.
  const incomingByCode: Record<string, number> = {}
  for (const po of openPkgPos || []) {
    for (const it of (po as any).items || []) {
      if (!it.sku) continue
      const remaining = Math.max(0, Number(it.qty || 0) - Number(it.received_qty || 0))
      if (remaining <= 0) continue
      incomingByCode[it.sku] = (incomingByCode[it.sku] || 0) + remaining
    }
  }

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">Packaging</strong>
        </div>
        <div className="flex gap-2.5 items-center">
          <input
            type="text"
            placeholder="Search code, name..."
            className="bg-[#FAFAF7] border border-[#D4D0C7] rounded px-3 py-1.5 text-[13px] w-[300px] focus:outline-none focus:border-[#C8432C]"
          />
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">Packaging master</div>
            <h1 className="text-3xl font-medium tracking-tight">Packaging</h1>
            <div className="text-sm text-[#6B6B6B] mt-1">{packaging?.length || 0} packaging items</div>
          </div>
          <div className="flex gap-2 items-start">
            <SyncButton entity="packaging" />
            <CreatePackagingButton suppliers={suppliers || []} />
          </div>
        </div>

        <PackagingTable
          packaging={packaging || []}
          suppliers={suppliers || []}
          bomQtyByCode={bomQtyByCode}
          incomingByCode={incomingByCode}
        />
      </div>
    </div>
  )
}