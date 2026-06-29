'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { EditStockCommitmentModal } from './EditStockCommitmentModal'
import { CommitmentAttachments } from './CommitmentAttachments'

const typeLabel = (t: string) => ({
  campaign: 'Campaign', roadshow: 'Roadshow', pharmacy_push: 'Pharmacy Push',
  so: 'SO', influencer_sampling: 'Influencer Sampling',
} as Record<string, string>)[t] || t

const typeBadge = (t: string) => ({
  campaign: 'bg-[#F5E4E0] text-[#C8432C]',
  roadshow: 'bg-[#F5EDD6] text-[#B8860B]',
  pharmacy_push: 'bg-[#DDE8EF] text-[#2C5F7C]',
  so: 'bg-[#E4EDE0] text-[#4A6B3D]',
  influencer_sampling: 'bg-[#E8E0EF] text-[#6B4A7C]',
} as Record<string, string>)[t] || 'bg-[#E8E5DE] text-[#3D3D3D]'

const statusBadge = (s: string) => ({
  active: 'bg-[#E4EDE0] text-[#4A6B3D]',
  fulfilled: 'bg-[#E8E5DE] text-[#6B6B6B]',
  cancelled: 'bg-[#F5DEDA] text-[#A53025]',
} as Record<string, string>)[s] || 'bg-[#E8E5DE] text-[#6B6B6B]'

function fmtDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—'
  if (start && end && start !== end) return `${start} → ${end}`
  return start || end || '—'
}

type Product = { sku: string; product_name: string; brand: string }

export function CommitmentDetailClient({ head, rows, products }: { head: any; rows: any[]; products: Product[] }) {
  const router = useRouter()
  const productMap = useMemo(() => new Map(products.map(p => [p.sku, p])), [products])
  const [editing, setEditing] = useState<any | null>(null)

  // Both shared-group commitments and legacy single-row commitments are
  // supported. For legacy, fall back to per-row PATCH/DELETE.
  const groupId: string | null = head.commitment_group_id || null

  async function markComplete() {
    if (!confirm(`Mark "${head.reserved_for}" (${rows.length} SKU${rows.length > 1 ? 's' : ''}) as Fulfilled?`)) return
    if (groupId) {
      const res = await fetch(`/api/stock-commitments/group/${encodeURIComponent(groupId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'fulfilled' }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Failed'); return }
    } else {
      for (const r of rows) {
        await fetch(`/api/stock-commitments/${r.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'fulfilled' }),
        })
      }
    }
    router.refresh()
  }

  async function deleteGroup() {
    if (!confirm(`Delete "${head.reserved_for}" entirely?\nThis will remove ${rows.length} SKU row${rows.length > 1 ? 's' : ''}. Cannot be undone.`)) return
    if (groupId) {
      const res = await fetch(`/api/stock-commitments/group/${encodeURIComponent(groupId)}`, { method: 'DELETE' })
      if (!res.ok) { alert((await res.json()).error || 'Failed'); return }
    } else {
      for (const r of rows) {
        await fetch(`/api/stock-commitments/${r.id}`, { method: 'DELETE' })
      }
    }
    router.push('/stock-commitments')
  }

  return (
    <>
      {/* Action bar */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setEditing(head)} className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[13px] hover:bg-[#FAFAF7]">
          Edit metadata
        </button>
        {head.status !== 'fulfilled' && (
          <button onClick={markComplete} className="px-3 py-1.5 border border-[#4A6B3D] text-[#4A6B3D] rounded text-[13px] hover:bg-[#E8EFE5]">
            ✓ Mark as Complete
          </button>
        )}
        <button onClick={deleteGroup} className="px-3 py-1.5 border border-[#A53025] text-[#A53025] rounded text-[13px] hover:bg-[#F5DEDA] ml-auto">
          Delete commitment
        </button>
      </div>

      {/* Summary card */}
      <div className="bg-white border border-[#D4D0C7] rounded-lg p-6 mb-6 grid grid-cols-2 lg:grid-cols-4 gap-y-4 gap-x-8">
        <Cell label="Type">
          <span className={`inline-block px-2 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider font-semibold ${typeBadge(head.commitment_type)}`}>
            {typeLabel(head.commitment_type)}
          </span>
        </Cell>
        <Cell label="Status">
          <span className={`inline-block px-2 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider font-semibold ${statusBadge(head.status)}`}>
            {head.status}
          </span>
        </Cell>
        <Cell label="WMS Order ID">
          {head.wms_order_id
            ? <span className="font-mono text-[12px] text-[#4A6B3D]">✓ {head.wms_order_id}</span>
            : <span className="font-mono text-[12px] text-[#A87B1F]">⚠ not in WMS</span>}
        </Cell>
        <Cell label="Created By">
          <span className="text-[13px]">{head.created_by || '—'}</span>
        </Cell>
        <Cell label="Required">
          <span className="font-mono text-[12px]">{fmtDateRange(head.required_by_date, head.required_by_date_end)}</span>
        </Cell>
        <Cell label="Total SKUs">
          <span className="font-mono text-[13px] font-semibold">{rows.length}</span>
        </Cell>
        <Cell label="Total Qty">
          <span className="font-mono text-[13px] font-semibold">{rows.reduce((s, r) => s + (Number(r.qty) || 0), 0).toLocaleString()}</span>
        </Cell>
        <Cell label="Created At">
          <span className="font-mono text-[11px] text-[#6B6B6B]">{head.created_at ? new Date(head.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' }) : '—'}</span>
        </Cell>
      </div>

      {head.notes && (
        <div className="bg-white border border-[#D4D0C7] rounded-lg p-5 mb-6">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-2 font-semibold">Notes</div>
          <div className="text-[13px] whitespace-pre-wrap">{head.notes}</div>
        </div>
      )}

      {/* SKU list */}
      <div className="bg-white border border-[#D4D0C7] rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#D4D0C7] flex items-center justify-between">
          <div className="font-medium text-[14px]">Committed SKUs</div>
          <div className="font-mono text-[11px] text-[#6B6B6B]">{rows.length} SKU{rows.length === 1 ? '' : 's'}</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
              <tr>
                {['SKU', 'Product', 'Brand', 'Qty', 'Action'].map(h => (
                  <th key={h} className="text-left px-5 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const product = productMap.get(r.product_sku)
                return (
                  <tr key={r.id} className="border-b border-[#F0EDE4] last:border-0 hover:bg-[#FAFAF7]">
                    <td className="px-5 py-3 font-mono font-medium">{r.product_sku}</td>
                    <td className="px-5 py-3 text-[#3D3D3D]">{product?.product_name || '—'}</td>
                    <td className="px-5 py-3 text-[#6B6B6B]">{product?.brand || '—'}</td>
                    <td className="px-5 py-3 font-mono font-semibold">{Number(r.qty || 0).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => setEditing(r)}
                        className="px-2.5 py-1 border border-[#D4D0C7] rounded text-[11px] hover:bg-[#FAFAF7]"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Attachments */}
      <div className="mt-6">
        <CommitmentAttachments groupId={groupId} />
      </div>

      {editing && <EditStockCommitmentModal commitment={editing} products={products} onClose={() => setEditing(null)} />}
    </>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1.5 font-semibold">{label}</div>
      <div>{children}</div>
    </div>
  )
}
