import { readO2OStock } from '@/lib/hq-o2o-stock'
import { O2OStockClient } from '@/components/O2OStockClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function O2OStockPage() {
  let data: any = { shops: [], pivot: [], shopsByBrand: new Map() }
  let fetchError: string | null = null
  try {
    data = await readO2OStock()
  } catch (e: any) {
    fetchError = e?.message || 'Failed to read O2O Stock sheet'
  }

  // Serialise Map to plain object for the client component
  const shopsByBrand: Record<string, any[]> = {}
  for (const [b, list] of data.shopsByBrand as Map<string, any[]>) shopsByBrand[b] = list

  const totalShops = data.shops.length
  const totalSkus = data.pivot.length

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">O2O Stock</strong>
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">Master data · live</div>
            <h1 className="text-3xl font-medium tracking-tight">O2O Stock</h1>
            <div className="text-sm text-[#6B6B6B] mt-1">
              Online-to-offline channel stock · {totalShops} shop{totalShops === 1 ? '' : 's'} · {totalSkus} SKU{totalSkus === 1 ? '' : 's'} · merged from 5 brand tabs
            </div>
          </div>
        </div>

        {fetchError ? (
          <div className="p-4 bg-[#F5DEDA] border border-[#A53025] rounded text-[#A53025]">
            <strong>Error reading O2O Stock sheet:</strong> {fetchError}
          </div>
        ) : totalShops === 0 ? (
          <div className="p-4 bg-[#F5EDD6] border border-[#B8860B] rounded text-[#8B6F1B] text-[13px]">
            <strong>No rows read.</strong> Check that the service account email has Viewer access to the O2O sheet,
            and that each tab has Row 0 = <code>Shop Code | Shop Name | SKU1 | SKU2 | …</code>.
          </div>
        ) : (
          <O2OStockClient shops={data.shops} pivot={data.pivot} shopsByBrand={shopsByBrand} />
        )}
      </div>
    </div>
  )
}
