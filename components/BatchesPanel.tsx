'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BatchModal, type Batch } from './BatchModal'

/** Expiry color tier. Drives both header text color + row tint. */
function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function expiryTier(expiry: string): 'fresh' | 'watch12' | 'watch6' | 'critical' | 'expired' {
  const d = new Date(expiry)
  if (isNaN(d.getTime())) return 'fresh'
  const days = Math.floor((d.getTime() - Date.now()) / 86400000)
  if (days < 0) return 'expired'
  if (days < 90) return 'critical'  // < 3 months
  if (days < 180) return 'watch6'   // < 6 months
  if (days < 365) return 'watch12'  // < 12 months
  return 'fresh'
}

const tierStyle: Record<string, { bg: string; text: string; label: string }> = {
  fresh: { bg: 'bg-[#E4EDE0]', text: 'text-[#4A6B3D]', label: 'Fresh' },
  watch12: { bg: 'bg-[#F5EDD6]', text: 'text-[#B8860B]', label: '< 12 mo' },
  watch6: { bg: 'bg-[#FDE5C8]', text: 'text-[#8B4F0B]', label: '< 6 mo' },
  critical: { bg: 'bg-[#F5DEDA]', text: 'text-[#A53025]', label: '< 3 mo · urgent' },
  expired: { bg: 'bg-[#E8E5DE]', text: 'text-[#3D3D3D]', label: 'EXPIRED' },
}

export function BatchesPanel({ batches: initial, brand, sku }: { batches: Batch[]; brand: string; sku: string }) {
  const router = useRouter()
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Batch | null>(null)

  // Show active batches (sorted by expiry asc) followed by inactive ones
  const active = initial.filter(b => b.status === 'active')
  const inactive = initial.filter(b => b.status !== 'active')

  return (
    <>
      <div className="bg-white border border-[#D4D0C7] rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#D4D0C7] flex items-center justify-between">
          <div>
            <div className="font-medium text-[14px]">Batches</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mt-0.5">
              FEFO order · earliest expiry first
            </div>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="px-3 py-1.5 bg-[#1A1A1A] text-white rounded text-[13px] hover:bg-[#C8432C] transition-colors"
          >
            + Add Batch
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
              <tr>
                {['Batch #', 'Expiry', 'Manufactured', 'Qty Received', 'Qty Remaining', 'Warehouse', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-5 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...active, ...inactive].length === 0 && (
                <tr><td colSpan={8} className="px-5 py-12 text-center text-[#6B6B6B]">
                  <div className="text-sm">No batches yet for this SKU.</div>
                  <div className="text-xs mt-1">Click <strong>+ Add Batch</strong> to record one.</div>
                </td></tr>
              )}
              {[...active, ...inactive].map(b => {
                const tier = b.status === 'active' && b.expiry_date ? expiryTier(b.expiry_date) : 'expired'
                const style = tierStyle[tier]
                return (
                  <tr key={b.id} className={`border-b border-[#F0EDE4] last:border-0 ${b.status === 'active' ? '' : 'opacity-60'}`}>
                    <td className="px-5 py-3 font-mono font-medium">{b.batch_number}</td>
                    <td className="px-5 py-3 font-mono">
                      <div className="flex items-center gap-2">
                        <span>{b.expiry_date ? fmtDate(b.expiry_date) : '—'}</span>
                        <span className={`inline-block px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider font-semibold ${style.bg} ${style.text}`}>{style.label}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 font-mono text-[12px]">{b.manufactured_date ? fmtDate(b.manufactured_date) : '—'}</td>
                    <td className="px-5 py-3 font-mono text-right">{Number(b.qty).toLocaleString()}</td>
                    <td className="px-5 py-3 font-mono text-right font-semibold">{Number(b.qty_remaining).toLocaleString()}</td>
                    <td className="px-5 py-3 text-[#6B6B6B]">{b.warehouse || '—'}</td>
                    <td className="px-5 py-3">
                      <span className="inline-block px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider font-semibold bg-[#E8E5DE] text-[#3D3D3D]">{b.status}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => setEditing(b)} className="text-[11px] font-mono uppercase text-[#C8432C] hover:underline">Edit</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {(showAdd || editing) && (
        <BatchModal
          batch={editing}
          brand={brand}
          sku={sku}
          onClose={() => { setShowAdd(false); setEditing(null) }}
          onSaved={() => { setShowAdd(false); setEditing(null); router.refresh() }}
        />
      )}
    </>
  )
}
