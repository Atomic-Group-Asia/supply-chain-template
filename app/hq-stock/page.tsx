import { readHQStock } from '@/lib/hq-o2o-stock'
import { StockChannelTable } from '@/components/StockChannelTable'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function HQStockPage() {
  let rows: any[] = []
  let fetchError: string | null = null
  try {
    rows = await readHQStock()
  } catch (e: any) {
    fetchError = e?.message || 'Failed to read HQ Stock sheet'
  }

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">HQ Stock</strong>
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">Master data · live</div>
            <h1 className="text-3xl font-medium tracking-tight">HQ Stock</h1>
            <div className="text-sm text-[#6B6B6B] mt-1">
              Headquarters warehouse · {rows.length} SKU{rows.length === 1 ? '' : 's'} · sourced from <code>🏢 HQ Master</code> sheet
            </div>
          </div>
        </div>

        {fetchError ? (
          <div className="p-4 bg-[#F5DEDA] border border-[#A53025] rounded text-[#A53025]">
            <strong>Error reading HQ Stock sheet:</strong> {fetchError}
          </div>
        ) : (
          <StockChannelTable rows={rows} />
        )}
      </div>
    </div>
  )
}
