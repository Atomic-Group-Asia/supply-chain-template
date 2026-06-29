import { supabaseAdmin } from '@/lib/supabase'
import { StockCommitmentsTable } from '@/components/StockCommitmentsTable'
import { CreateStockCommitmentButton } from '@/components/CreateStockCommitmentButton'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function StockCommitmentsPage() {
  const [{ data: commitments }, { data: products }] = await Promise.all([
    supabaseAdmin.from('stock_commitments').select('*').order('required_by_date', { ascending: true, nullsFirst: false }),
    supabaseAdmin.from('products').select('*').order('sku'),
  ])

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">Stock Commitments</strong>
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">Reserved stock</div>
            <h1 className="text-3xl font-medium tracking-tight">Stock Commitments</h1>
            <div className="text-sm text-[#6B6B6B] mt-1">{commitments?.length || 0} total</div>
          </div>
          <div className="flex gap-2 items-start">
            <CreateStockCommitmentButton products={products || []} />
          </div>
        </div>

        <StockCommitmentsTable commitments={commitments || []} products={products || []} />
      </div>
    </div>
  )
}