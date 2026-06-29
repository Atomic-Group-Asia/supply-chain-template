import { supabaseAdmin } from '@/lib/supabase'
import { SyncButton } from '@/components/SyncButton'
import { CreateSupplierButton } from '@/components/CreateSupplierButton'
import { SuppliersTable } from '@/components/SuppliersTable'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SuppliersPage() {
  const { data: suppliers, error } = await supabaseAdmin
    .from('suppliers').select('*').order('supplier_code')

  if (error) {
    return (
      <div className="p-7">
        <h1 className="text-2xl font-bold text-[#A53025]">Error</h1>
        <pre className="mt-4 p-4 bg-[#F5DEDA] rounded">{error.message}</pre>
      </div>
    )
  }

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">Suppliers</strong>
        </div>
        <div className="flex gap-2.5 items-center">
          <input
            type="text"
            placeholder="Search SKU, PO, supplier..."
            className="bg-[#FAFAF7] border border-[#D4D0C7] rounded px-3 py-1.5 text-[13px] w-[300px] focus:outline-none focus:border-[#C8432C]"
          />
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">Supplier master</div>
            <h1 className="text-3xl font-medium tracking-tight">Suppliers</h1>
            <div className="text-sm text-[#6B6B6B] mt-1">{suppliers?.length || 0} suppliers</div>
          </div>
          <div className="flex gap-2 items-start">
            <SyncButton />
            <CreateSupplierButton />
          </div>
        </div>

        <SuppliersTable suppliers={suppliers || []} />
      </div>
    </div>
  )
}
