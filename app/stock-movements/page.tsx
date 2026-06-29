import { supabaseAdmin } from '@/lib/supabase'
import { StockMovementsTable } from '@/components/StockMovementsTable'
import { UploadStockMovementsButton } from '@/components/UploadStockMovementsButton'

export const dynamic = 'force-dynamic'

export default async function StockMovementsPage() {
  // Supabase enforces a 1000-row cap per response at the project level
  // (Settings → API → max rows). The stock_movements table has > 1000
  // rows so we paginate to pull everything. Loop stops as soon as a
  // page returns fewer rows than the page size.
  const PAGE = 1000
  const movements: any[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('stock_movements')
      .select('*')
      .order('date_start', { ascending: false })
      .range(offset, offset + PAGE - 1)
    if (error || !data || data.length === 0) break
    movements.push(...data)
    if (data.length < PAGE) break
  }

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">Stock Movements</strong>
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">Inventory ledger</div>
            <h1 className="text-3xl font-medium tracking-tight">Stock Movements</h1>
            <div className="text-sm text-[#6B6B6B] mt-1">{movements?.length || 0} records</div>
          </div>
          <UploadStockMovementsButton />
        </div>

        <StockMovementsTable movements={movements || []} />
      </div>
    </div>
  )
}