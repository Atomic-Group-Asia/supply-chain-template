import { supabaseAdmin } from '@/lib/supabase'
import { ApprovalsTable } from '@/components/ApprovalsTable'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ApprovalsPage() {
  const { data: orders } = await supabaseAdmin
    .from('purchase_orders')
    .select('*, items:purchase_order_items(*)')
    .in('status', ['pending', 'approved', 'rejected', 'partial_received', 'received'])
    .order('created_at', { ascending: false })

  const pending = (orders || []).filter(o => o.status === 'pending')
  const approved = (orders || []).filter(o => o.status === 'approved')
  const rejected = (orders || []).filter(o => o.status === 'rejected')
  // Completed = fully or partially received. Both are post-approval lifecycle states.
  const completed = (orders || []).filter(o => o.status === 'received' || o.status === 'partial_received')

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">Approvals</strong>
        </div>
        <div className="flex gap-2.5 items-center">
          <input
            type="text"
            placeholder="Search PO, supplier..."
            className="bg-[#FAFAF7] border border-[#D4D0C7] rounded px-3 py-1.5 text-[13px] w-[300px] focus:outline-none focus:border-[#C8432C]"
          />
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">
              Your attention required
            </div>
            <h1 className="text-3xl font-medium tracking-tight">Approval Queue</h1>
            <div className="text-sm text-[#6B6B6B] mt-1">
              {pending.length} pending · {approved.length} approved · {completed.length} completed · {rejected.length} rejected
            </div>
          </div>
        </div>

        <ApprovalsTable
          pending={pending as any}
          approved={approved as any}
          rejected={rejected as any}
          completed={completed as any}
        />
      </div>
    </div>
  )
}
