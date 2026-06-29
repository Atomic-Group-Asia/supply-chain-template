'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { POActionsMenu } from './POActionsMenu'

type Item = {
  id: string
  brand: string
  sku: string | null
  product_name: string
  qty: number
  uom: string
  unit_cost: number
  amount: number
  notes: string | null
  reason: string | null
  expected_date: string | null
}

type PO = {
  id: string
  po_number: string
  entity_code: string
  entity_name: string
  po_type: string
  brands: string[]
  supplier_name: string
  total_qty: number
  total_amount: number
  terms: string | null
  status: string
  drafted_by: string
  drafted_at: string
  expected_date: string | null
  items: Item[]
}

// Tab order: Pending first (default), All last so users land on the
// queue that needs action.
const STATUSES = ['pending', 'approved', 'partial_received', 'received', 'rejected', 'cancelled', 'all'] as const
type Status = typeof STATUSES[number]

const statusColor: Record<string, string> = {
  pending: 'bg-[#F5EDD6] text-[#8B6F1B]',
  approved: 'bg-[#E8EFE5] text-[#4A6B3D]',
  partial_received: 'bg-[#F5EDD6] text-[#A87B1F]',
  rejected: 'bg-[#F5DEDA] text-[#A53025]',
  received: 'bg-[#DDE7F0] text-[#2C5282]',
  cancelled: 'bg-[#EDEAE2] text-[#6B6B6B]',
}

const statusLabel: Record<string, string> = {
  all: 'All',
  pending: 'Pending',
  approved: 'Approved',
  partial_received: 'Partial',
  received: 'Received',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export function PurchaseOrdersTable({ orders }: { orders: PO[] }) {
  const [filter, setFilter] = useState<Status>('pending')
  const [entityFilter, setEntityFilter] = useState<string>('all')

  const entities = useMemo(() => Array.from(new Set(orders.map(o => o.entity_code))).sort(), [orders])

  const visible = orders.filter(o => {
    if (filter !== 'all' && o.status !== filter) return false
    if (entityFilter !== 'all' && o.entity_code !== entityFilter) return false
    return true
  })

  return (
    <>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-mono ${
              filter === s ? 'bg-[#1A1A1A] text-white' : 'border border-[#D4D0C7] hover:bg-[#FAFAF7]'
            }`}
          >
            {statusLabel[s] || s} ({s === 'all' ? orders.length : orders.filter(o => o.status === s).length})
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-wider font-mono text-[#6B6B6B]">Entity</label>
          <select
            value={entityFilter}
            onChange={e => setEntityFilter(e.target.value)}
            className="px-2 py-1 border border-[#D4D0C7] rounded text-[12px] bg-white"
          >
            <option value="all">All</option>
            {entities.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
              <th className="px-3 py-2.5">PO #</th>
              <th className="px-3 py-2.5">Supplier</th>
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5 text-right">Amount</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">ETA</th>
              <th className="px-3 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-[#6B6B6B]">No POs match this filter</td>
              </tr>
            )}
            {visible.map(po => (
              <tr key={po.id} className="border-t border-[#F0EDE4] hover:bg-[#FAFAF7]">
                <td className="px-3 py-2.5 font-mono text-[12px]">
                  <Link href={`/purchase-orders/${po.id}`} className="text-[#C8432C] hover:underline">{po.po_number}</Link>
                </td>
                <td className="px-3 py-2.5"><span className="sensitive">{po.supplier_name}</span></td>
                <td className="px-3 py-2.5">
                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-[#E8E5DE] text-[#3D3D3D] font-mono">{po.po_type}</span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono">
                  <span className="sensitive">RM {Number(po.total_amount).toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${statusColor[po.status] || ''}`}>
                    {po.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[12px]" title="Earliest across lines (or PO header if no line ETAs)">{earliestEta(po) || '—'}</td>
                <td className="px-3 py-2.5 text-right">
                  <POActionsMenu po={po} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[10px] font-mono text-[#6B6B6B]">
        Entity · Brands · Items count · Total Qty · Payment Terms — click a PO to view full details.
      </div>
    </>
  )
}

/** Earliest ETA across this PO: min(line.expected_date) with PO header
 *  as fallback if no line has its own. Lets the list show the soonest
 *  arrival when a PO has multiple shipments with different ETAs. */
function earliestEta(po: PO): string | null {
  let min: string | null = null
  for (const it of (po.items || [])) {
    const eta = it.expected_date
    if (!eta) continue
    if (!min || eta < min) min = eta
  }
  return min || po.expected_date || null
}
