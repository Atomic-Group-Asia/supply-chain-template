'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BatchModal } from './BatchModal'

type Batch = {
  id: string
  sku: string
  brand: string | null
  batch_number: string
  manufactured_date: string | null
  expiry_date: string
  qty: number
  qty_remaining: number | null
  warehouse: string | null
  notes: string | null
  status: string
}

const statusColor: Record<string, string> = {
  active: 'bg-[#E8EFE5] text-[#4A6B3D]',
  depleted: 'bg-[#EDEAE2] text-[#6B6B6B]',
  expired: 'bg-[#F5DEDA] text-[#A53025]',
  recalled: 'bg-[#F5DEDA] text-[#A53025]',
}

function daysUntil(date: string): number {
  const d = new Date(date)
  const today = new Date()
  return Math.floor((d.getTime() - today.getTime()) / 86400000)
}

/** YYYY-MM-DD → DD/MM/YYYY (UK-style display preferred by ops). */
function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export function BatchesDetailTable({ batches, brand, sku }: { batches: Batch[]; brand: string; sku: string }) {
  const router = useRouter()
  const [tab, setTab] = useState<'active' | 'depleted' | 'all'>('active')
  const [editing, setEditing] = useState<Batch | null>(null)
  const [creating, setCreating] = useState(false)

  const enriched = useMemo(() => batches.map(b => {
    const days = b.expiry_date ? daysUntil(b.expiry_date) : Infinity
    const isExpired = b.expiry_date ? days < 0 : false
    const isExpiring = b.expiry_date ? (days >= 0 && days < 90) : false
    const isActive = b.status === 'active' && (Number(b.qty_remaining) || 0) > 0
    return { ...b, daysUntilExpiry: days, isExpired, isExpiring, isActive }
  }), [batches])

  const counts = {
    active: enriched.filter(b => b.isActive).length,
    depleted: enriched.filter(b => !b.isActive).length,
    all: enriched.length,
  }

  const filtered = useMemo(() => {
    let list = enriched
    if (tab === 'active') list = list.filter(b => b.isActive)
    else if (tab === 'depleted') list = list.filter(b => !b.isActive)
    return list
  }, [enriched, tab])

  return (
    <>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex gap-2">
          {(['active', 'depleted', 'all'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-mono ${
                tab === t ? 'bg-[#1A1A1A] text-white' : 'border border-[#D4D0C7] hover:bg-[#FAFAF7]'
              }`}
            >
              {t === 'active' ? 'Active' : t === 'depleted' ? 'Depleted' : 'All'} ({counts[t]})
            </button>
          ))}
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-3.5 py-1.5 bg-[#1A1A1A] text-white rounded text-[13px] hover:bg-[#C8432C] transition-colors"
        >+ New Batch</button>
      </div>

      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
              <th className="px-4 py-2.5">Batch No.</th>
              <th className="px-4 py-2.5">Mfg Date</th>
              <th className="px-4 py-2.5">Expiry</th>
              <th className="px-4 py-2.5 text-right">Days Left</th>
              <th className="px-4 py-2.5 text-right" title="Original qty when batch was first recorded">Qty</th>
              <th className="px-4 py-2.5 text-right" title="Remaining after FEFO reconciliation">Remaining</th>
              <th className="px-4 py-2.5">Warehouse</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[#6B6B6B]">
                  <div className="text-[14px] mb-1">No {tab === 'all' ? '' : tab} batches</div>
                  {tab === 'active' && (
                    <div className="text-[11px]">Click + New Batch to record this SKU's OEM batch numbers and expiry dates.</div>
                  )}
                </td>
              </tr>
            )}
            {filtered.map(b => {
              const days = b.daysUntilExpiry
              const isCritical = b.isExpired || (days >= 0 && days < 30)
              const isDepleted = !b.isActive
              return (
                <tr
                  key={b.id}
                  className={`border-t border-[#F0EDE4] hover:bg-[#FAFAF7] cursor-pointer ${isDepleted ? 'opacity-60' : ''}`}
                  onClick={() => setEditing(b)}
                  title="Click to edit"
                >
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#1A1A1A]">{b.batch_number}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">{b.manufactured_date ? fmtDate(b.manufactured_date) : '—'}</td>
                  <td className={`px-4 py-2.5 font-mono text-[11px] ${isCritical && !isDepleted ? 'text-[#C8432C] font-semibold' : ''}`}>{fmtDate(b.expiry_date)}</td>
                  <td className={`px-4 py-2.5 text-right font-mono text-[12px] ${isDepleted ? '' : isCritical ? 'text-[#C8432C] font-semibold' : b.isExpiring ? 'text-[#B8860B]' : 'text-[#4A6B3D]'}`}>
                    {b.isExpired ? `${Math.abs(days)} expired` : `${days} days`}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[#6B6B6B]">{Number(b.qty).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{Number(b.qty_remaining ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-[12px]">{b.warehouse || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${statusColor[isDepleted ? 'depleted' : b.status] || statusColor.active}`}>
                      {b.isExpired ? 'EXPIRED' : isDepleted ? 'depleted' : b.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <BatchModal
          batch={editing as any}
          brand={editing.brand || brand}
          sku={editing.sku}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh() }}
        />
      )}
      {creating && (
        <BatchModal
          batch={null as any}
          brand={brand}
          sku={sku}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); router.refresh() }}
        />
      )}
    </>
  )
}
