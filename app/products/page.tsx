import { CreateProductButton } from '@/components/CreateProductButton'
import { supabaseAdmin } from '@/lib/supabase'
import { SyncButton } from '@/components/SyncButton'
import { ProductsTable } from '@/components/ProductsTable'
import { readFGStockByBrandSku, readFGIncomingByBrandSku } from '@/lib/fg-inventory'
import { fetchRecentStockMovements } from '@/lib/stock-movements'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function ProductsPage() {
  const [{ data: products }, { data: suppliers }, movements, stockMap, incomingMap] = await Promise.all([
    supabaseAdmin.from('products').select('*').order('sku'),
    supabaseAdmin.from('suppliers').select('*').order('supplier_code'),
    fetchRecentStockMovements(),
    readFGStockByBrandSku(),
    readFGIncomingByBrandSku(),
  ])

  // Aggregate OUT qty per (brand::sku, YYYY-MM)
  const today = new Date()
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
  function basisAvg(brand: string, sku: string): number {
    const l3m = avgOver(brand, sku, 3)
    if (l3m > 0) return l3m
    const l6m = avgOver(brand, sku, 6)
    if (l6m > 0) return l6m
    return avgOver(brand, sku, 1)
  }

  // Enrich each product with stock-velocity metrics so the table can
  // render Available / Months Left / Avg/mo without a per-row API
  // round-trip. Months Left uses Available only (does NOT factor in
  // incoming POs) — incoming is shown as metadata so the user can see
  // there's stock on the way without confusing the velocity calc.
  const enriched = (products || []).map((p: any) => {
    const k = `${p.brand}::${p.sku}`
    const available = stockMap.get(k) || 0
    const incoming = incomingMap.get(k) || 0
    const avg = p.brand ? basisAvg(p.brand, p.sku) : 0
    const stockMonths = avg > 0 ? available / avg : null
    return {
      ...p,
      available,
      incoming,
      avg_per_month: avg > 0 ? avg : null,
      months_left: stockMonths,
    }
  })

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">Products</strong>
        </div>
        <div className="flex gap-2.5 items-center">
          <input
            type="text"
            placeholder="Search SKU, product..."
            className="bg-[#FAFAF7] border border-[#D4D0C7] rounded px-3 py-1.5 text-[13px] w-[300px] focus:outline-none focus:border-[#C8432C]"
          />
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">Product master</div>
            <h1 className="text-3xl font-medium tracking-tight">Products</h1>
            <div className="text-sm text-[#6B6B6B] mt-1">{products?.length || 0} products</div>
          </div>
          <div className="flex gap-2 items-start">
  <SyncButton entity="products" />
  <CreateProductButton suppliers={suppliers || []} />
</div>
        </div>

        <ProductsTable products={enriched} suppliers={suppliers || []} />
      </div>
    </div>
  )
}