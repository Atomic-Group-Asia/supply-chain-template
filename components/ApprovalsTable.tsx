'use client'

import { useState } from 'react'
import { POActionsMenu } from './POActionsMenu'

type PO = {
  id: string
  po_number: string
  entity_code: string
  po_type: string
  brands: string[]
  supplier_name: string
  total_qty: number
  total_amount: number
  terms: string | null
  status: string
  drafted_by: string
  drafted_at: string
  received_by?: string | null
  received_at?: string | null
  items?: any[]
}

const tagColors: Record<string, string> = {
  red: 'bg-[#F5DEDA] text-[#A53025]',
  blue: 'bg-[#DDE7F0] text-[#2C5282]',
  gray: 'bg-[#EDEAE2] text-[#1A1A1A]',
}

export function ApprovalsTable({
  pending,
  approved,
  rejected,
  completed = [],
}: {
  pending: PO[]
  approved: PO[]
  rejected: PO[]
  completed?: PO[]
}) {
  const [tab, setTab] = useState<'pending' | 'approved' | 'completed' | 'rejected'>('pending')
  const list = tab === 'pending' ? pending : tab === 'approved' ? approved : tab === 'completed' ? completed : rejected
  const isCompleted = tab === 'completed'

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-4 border-b border-[#D4D0C7] -mb-px">
          <TabBtn active={tab === 'pending'} onClick={() => setTab('pending')}>
            Pending <Badge>{pending.length}</Badge>
          </TabBtn>
          <TabBtn active={tab === 'approved'} onClick={() => setTab('approved')}>
            Approved <Badge>{approved.length}</Badge>
          </TabBtn>
          <TabBtn active={tab === 'completed'} onClick={() => setTab('completed')}>
            Completed <Badge>{completed.length}</Badge>
          </TabBtn>
          <TabBtn active={tab === 'rejected'} onClick={() => setTab('rejected')}>
            Rejected <Badge>{rejected.length}</Badge>
          </TabBtn>
        </div>
      </div>

      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
              <th className="px-4 py-2.5">PO Number</th>
              <th className="px-4 py-2.5">Entity</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Brands</th>
              <th className="px-4 py-2.5">Supplier</th>
              <th className="px-4 py-2.5 text-right">Items</th>
              <th className="px-4 py-2.5 text-right">Qty</th>
              <th className="px-4 py-2.5 text-right">Amount</th>
              <th className="px-4 py-2.5">Terms</th>
              <th className="px-4 py-2.5">{isCompleted ? 'Received' : 'Drafted'}</th>
              <th className="px-4 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-8 text-center text-[#6B6B6B]">Nothing in {tab}</td>
              </tr>
            )}
            {list.map(po => (
              <tr key={po.id} className="border-t border-[#F0EDE4] hover:bg-[#FAFAF7]">
                <td className="px-4 py-2.5 font-mono text-[12px]">{po.po_number}</td>
                <td className="px-4 py-2.5"><Tag color="gray">{po.entity_code}</Tag></td>
                <td className="px-4 py-2.5"><Tag color={po.po_type === 'FG' ? 'red' : 'blue'}>{po.po_type}</Tag></td>
                <td className="px-4 py-2.5 text-[12px]">{(po.brands || []).join(' + ')}</td>
                <td className="px-4 py-2.5"><span className="sensitive">{po.supplier_name}</span></td>
                <td className="px-4 py-2.5 text-right font-mono">{po.items?.length || 0}</td>
                <td className="px-4 py-2.5 text-right font-mono">{Number(po.total_qty).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right font-mono">
                  <span className="sensitive">RM {Number(po.total_amount).toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                </td>
                <td className="px-4 py-2.5 text-[12px]">{po.terms || '—'}</td>
                <td className="px-4 py-2.5 text-[12px] text-[#6B6B6B]">
                  {isCompleted && po.received_by
                    ? <>{po.received_by} · {po.received_at ? timeAgo(po.received_at) : '—'}{po.status === 'partial_received' && <span className="ml-1 text-[#A87B1F]">(partial)</span>}</>
                    : <>{po.drafted_by} · {timeAgo(po.drafted_at)}</>}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <POActionsMenu po={po} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3600000)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  const m = Math.floor(ms / 60000)
  return `${m}m ago`
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-1 pb-2 text-[14px] border-b-2 transition-colors ${
        active ? 'border-[#C8432C] text-[#1A1A1A] font-medium' : 'border-transparent text-[#6B6B6B] hover:text-[#1A1A1A]'
      }`}
    >
      {children}
    </button>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-1 inline-block px-1.5 py-0.5 bg-[#F5DEDA] text-[#A53025] rounded text-[10px] font-mono">{children}</span>
  )
}

function Tag({ color, children }: { color: keyof typeof tagColors; children: React.ReactNode }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${tagColors[color]}`}>
      {children}
    </span>
  )
}
