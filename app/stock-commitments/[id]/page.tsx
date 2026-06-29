import { notFound } from 'next/navigation'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { CommitmentDetailClient } from '@/components/CommitmentDetailClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function CommitmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // The [id] route param is a commitment_group_id (shared UUID across all
  // SKUs in one commitment). Fall back to row id for legacy single-row
  // commitments that haven't been grouped yet.
  const [byGroup, byId, { data: products }] = await Promise.all([
    supabaseAdmin.from('stock_commitments').select('*').eq('commitment_group_id', id).order('created_at'),
    supabaseAdmin.from('stock_commitments').select('*').eq('id', id).order('created_at'),
    supabaseAdmin.from('products').select('sku, product_name, brand').order('sku'),
  ])

  const rows = (byGroup.data && byGroup.data.length > 0)
    ? byGroup.data
    : (byId.data || [])
  if (rows.length === 0) notFound()

  // All rows share the same metadata — take from the first row.
  const head = rows[0]
  const totalQty = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0)

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <Link href="/stock-commitments" className="hover:underline">Stock Commitments</Link> · <strong className="text-[#1A1A1A]">{head.reserved_for || head.id}</strong>
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">Commitment detail</div>
            <h1 className="text-3xl font-medium tracking-tight">{head.reserved_for || 'Commitment'}</h1>
            <div className="text-sm text-[#6B6B6B] mt-1">
              {rows.length} SKU{rows.length === 1 ? '' : 's'} · {totalQty.toLocaleString()} units total
            </div>
          </div>
          <Link href="/stock-commitments" className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[13px] hover:bg-[#FAFAF7]">
            ← Back to list
          </Link>
        </div>

        <CommitmentDetailClient head={head} rows={rows} products={products || []} />
      </div>
    </div>
  )
}
