import { supabaseAdmin } from '@/lib/supabase'
import { BatchesSkuTable } from '@/components/BatchesSkuTable'
import { NewBatchButton } from '@/components/NewBatchButton'
import { ReconcileBatchesButton } from '@/components/ReconcileBatchesButton'
import { readSkuMapping } from '@/lib/fg-inventory'
import { reconcileSkuBatches } from '@/lib/batch-reconcile'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function BatchesPage() {
  // 1. Auto-reconcile every (brand, sku) pair with batches so qty_remaining
  //    matches the current gsheet Available. Runs once per page load, in
  //    parallel (capped at 8 concurrent to be gentle on Postgrest).
  const { data: pairsRaw } = await supabaseAdmin.from('batches').select('brand, sku')
  const pairs = Array.from(new Set((pairsRaw || []).map(r => `${r.brand}::${r.sku}`)))
    .map(k => { const [b, s] = k.split('::'); return { brand: b, sku: s } })
    .filter(p => p.brand && p.sku)
  // Bust WH cache once up front, then reuse across all reconciles
  if (pairs.length > 0) {
    await reconcileSkuBatches(pairs[0].brand, pairs[0].sku).catch(() => {})
    const rest = pairs.slice(1)
    const CONCURRENCY = 8
    for (let i = 0; i < rest.length; i += CONCURRENCY) {
      const chunk = rest.slice(i, i + CONCURRENCY)
      await Promise.all(chunk.map(p =>
        reconcileSkuBatches(p.brand, p.sku, { skipCacheBust: true }).catch(() => null),
      ))
    }
  }

  // 2. SKU Mapping gsheet is the master list (broader than products table —
  //    covers HJT/TPD/etc. that don't have BOM data). It provides
  //    product_name + category for every SKU we batch.
  const [{ data: batches }, { data: products }, mapping] = await Promise.all([
    supabaseAdmin.from('batches').select('*').order('expiry_date', { ascending: true }),
    supabaseAdmin.from('products').select('sku, product_name, brand').order('sku'),
    readSkuMapping(),
  ])

  const productMap: Record<string, any> = {}
  // SKU Mapping first (broader), products overrides where it exists.
  for (const m of mapping) {
    productMap[m.sku] = { sku: m.sku, product_name: m.product_name, brand: m.brand, category: m.category }
  }
  for (const p of products || []) {
    const existing = productMap[p.sku] || {}
    productMap[p.sku] = { ...existing, ...p, category: existing.category || '' }
  }

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">Batches</strong>
        </div>
        <div className="flex gap-2.5 items-center">
          <input
            type="text"
            placeholder="Search SKU, batch #..."
            className="bg-[#FAFAF7] border border-[#D4D0C7] rounded px-3 py-1.5 text-[13px] w-[300px] focus:outline-none focus:border-[#C8432C]"
          />
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">Batch tracking</div>
            <h1 className="text-3xl font-medium tracking-tight">Batches</h1>
            <div className="text-sm text-[#6B6B6B] mt-1">
              By SKU · click a row to see all batches for that SKU
            </div>
          </div>
          <div className="flex gap-2 items-start">
            <ReconcileBatchesButton />
            <NewBatchButton
              products={Object.values(productMap).map((p: any) => ({
                sku: p.sku, product_name: p.product_name || p.sku, brand: p.brand || '',
              }))}
            />
          </div>
        </div>

        <BatchesSkuTable batches={batches || []} productMap={productMap} />
      </div>
    </div>
  )
}
