import { supabaseAdmin } from '@/lib/supabase'
import { SyncButton } from '@/components/SyncButton'
import { BOMTable } from '@/components/BOMTable'
import { CreateBOMButton } from '@/components/CreateBOMButton'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function BOMPage() {
  const [{ data: boms }, { data: products }, { data: packaging }, { data: suppliers }] = await Promise.all([
    supabaseAdmin.from('bom').select('*').order('product_sku'),
    supabaseAdmin.from('products').select('*').order('sku'),
    supabaseAdmin.from('packaging').select('*').order('packaging_code'),
    supabaseAdmin.from('suppliers').select('*').order('supplier_code'),
  ])

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">Bill of Materials</strong>
        </div>
        <div className="flex gap-2.5 items-center">
          <input
            type="text"
            placeholder="Search SKU, packaging..."
            className="bg-[#FAFAF7] border border-[#D4D0C7] rounded px-3 py-1.5 text-[13px] w-[300px] focus:outline-none focus:border-[#C8432C]"
          />
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">Bill of materials</div>
            <h1 className="text-3xl font-medium tracking-tight">BOM</h1>
            <div className="text-sm text-[#6B6B6B] mt-1">{boms?.length || 0} lines · {new Set(boms?.map(b => b.product_sku) || []).size} products</div>
          </div>
          <div className="flex gap-2 items-start">
            <SyncButton entity="bom" />
            <CreateBOMButton products={products || []} packaging={packaging || []} suppliers={suppliers || []} />
          </div>
        </div>

        <BOMTable boms={boms || []} products={products || []} packaging={packaging || []} suppliers={suppliers || []} />
      </div>
    </div>
  )
}