'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

const TYPES = ['All', 'campaign', 'roadshow', 'pharmacy_push', 'so', 'influencer_sampling']
const STATUSES = ['All', 'active', 'fulfilled', 'cancelled']

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

type Group = {
  key: string                          // group id (or synthetic for legacy)
  rows: any[]                          // child rows (per-SKU)
  // Shared metadata (derived from the first row of the group)
  reserved_for: string
  commitment_type: string
  status: string
  wms_order_id: string | null
  required_by_date: string | null
  required_by_date_end: string | null
  created_by: string | null
  notes: string | null
  total_qty: number
}

function groupCommitments(rows: any[]): Group[] {
  const map = new Map<string, Group>()
  for (const r of rows) {
    const k = r.commitment_group_id || `legacy-${r.id}`
    let g = map.get(k)
    if (!g) {
      g = {
        key: k, rows: [],
        reserved_for: r.reserved_for || '',
        commitment_type: r.commitment_type,
        status: r.status,
        wms_order_id: r.wms_order_id || null,
        required_by_date: r.required_by_date || null,
        required_by_date_end: r.required_by_date_end || null,
        created_by: r.created_by || null,
        notes: r.notes || null,
        total_qty: 0,
      }
      map.set(k, g)
    }
    g.rows.push(r)
    g.total_qty += Number(r.qty) || 0
  }
  return Array.from(map.values())
}

export function StockCommitmentsTable({ commitments, products }: { commitments: any[]; products: any[] }) {
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('All')
  const [filterStatus, setFilterStatus] = useState('active')
  const router = useRouter()

  const productMap = useMemo(() => new Map(products.map(p => [p.sku, p])), [products])
  const groups = useMemo(() => groupCommitments(commitments), [commitments])

  function detailSlug(g: Group): string {
    // Legacy rows without a group id route by row id (the detail page
    // falls back to id lookup).
    return g.key.startsWith('legacy-') ? g.rows[0].id : g.key
  }
  function openDetail(g: Group) {
    router.push(`/stock-commitments/${encodeURIComponent(detailSlug(g))}`)
  }

  async function markComplete(g: Group) {
    if (!confirm(`Mark "${g.reserved_for}" (${g.rows.length} SKU${g.rows.length > 1 ? 's' : ''}) as Fulfilled?`)) return
    // If the group has a real shared id, hit the bulk endpoint; otherwise
    // fall back to per-row PATCH for legacy rows.
    if (!g.key.startsWith('legacy-')) {
      const res = await fetch(`/api/stock-commitments/group/${encodeURIComponent(g.key)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'fulfilled' }),
      })
      if (!res.ok) { alert((await res.json()).error || 'Failed to mark complete'); return }
    } else {
      for (const r of g.rows) {
        await fetch(`/api/stock-commitments/${r.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'fulfilled' }),
        })
      }
    }
    router.refresh()
  }

  async function deleteGroup(g: Group) {
    if (!confirm(`Delete "${g.reserved_for}" entirely?\nThis will remove ${g.rows.length} SKU row${g.rows.length > 1 ? 's' : ''}. Cannot be undone.`)) return
    if (!g.key.startsWith('legacy-')) {
      const res = await fetch(`/api/stock-commitments/group/${encodeURIComponent(g.key)}`, { method: 'DELETE' })
      if (!res.ok) { alert((await res.json()).error || 'Failed to delete'); return }
    } else {
      for (const r of g.rows) {
        await fetch(`/api/stock-commitments/${r.id}`, { method: 'DELETE' })
      }
    }
    router.refresh()
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return groups.filter(g => {
      if (filterType !== 'All' && g.commitment_type !== filterType) return false
      if (filterStatus !== 'All' && g.status !== filterStatus) return false
      if (q) {
        // Search hits group metadata OR any child SKU/product name
        if (
          g.reserved_for?.toLowerCase().includes(q) ||
          g.wms_order_id?.toLowerCase().includes(q) ||
          g.created_by?.toLowerCase().includes(q) ||
          g.notes?.toLowerCase().includes(q)
        ) return true
        return g.rows.some(r => {
          const product = productMap.get(r.product_sku)
          return (
            r.product_sku?.toLowerCase().includes(q) ||
            product?.product_name?.toLowerCase().includes(q)
          )
        })
      }
      return true
    })
  }, [groups, filterType, filterStatus, search, productMap])

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search reserved for, SKU, WMS order…"
          className="flex-1 max-w-[500px] bg-white border border-[#D4D0C7] rounded px-3 py-2 text-[13px] focus:outline-none focus:border-[#C8432C]"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-[11px] font-mono text-[#6B6B6B] px-2">Clear</button>
        )}
        <span className="ml-auto text-[11px] font-mono text-[#6B6B6B]">
          Showing {filtered.length} of {groups.length} commitments
        </span>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] min-w-[60px] font-semibold">Type</span>
        {TYPES.map(t => {
          const count = t === 'All' ? groups.length : groups.filter(g => g.commitment_type === t).length
          const active = filterType === t
          return (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                active ? 'bg-[#1A1A1A] text-[#FAFAF7] border-[#1A1A1A]' : 'bg-white border-[#D4D0C7] text-[#3D3D3D] hover:border-[#1A1A1A]'
              }`}
            >
              {t === 'All' ? 'All' : typeLabel(t)} <span className="opacity-60">({count})</span>
            </button>
          )
        })}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] min-w-[60px] font-semibold">Status</span>
        {STATUSES.map(s => {
          const count = s === 'All' ? groups.length : groups.filter(g => g.status === s).length
          const active = filterStatus === s
          return (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                active ? 'bg-[#C8432C] text-[#FAFAF7] border-[#C8432C]' : 'bg-white border-[#D4D0C7] text-[#3D3D3D] hover:border-[#1A1A1A]'
              }`}
            >
              {s === 'All' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)} <span className="opacity-60">({count})</span>
            </button>
          )
        })}
      </div>

      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
              <tr>
                {['Type', 'Reserved For', 'WMS Order', 'SKUs', 'Total Qty', 'Required', 'Created By', 'Status'].map(h => (
                  <th key={h} className="text-left px-5 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold whitespace-nowrap">{h}</th>
                ))}
                <th className="text-right px-5 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="px-7 py-12 text-center text-[#6B6B6B]">
                  <div className="text-sm">No commitments match the current filters.</div>
                  <div className="text-xs mt-1">Click <strong>+ Stock Commitment</strong> to add one.</div>
                </td></tr>
              )}
              {filtered.map(g => (
                <tr
                  key={g.key}
                  className="border-b border-[#E8E5DE] hover:bg-[#FAFAF7] transition-colors"
                >
                  <td className="px-5 py-3 cursor-pointer" onClick={() => openDetail(g)}>
                    <span className={`inline-block px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider font-semibold ${typeBadge(g.commitment_type)}`}>
                      {typeLabel(g.commitment_type)}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-medium">{g.reserved_for || '—'}</td>
                  <td className="px-5 py-3 font-mono text-[11px]">
                    {g.wms_order_id
                      ? <span title="Reservation reference in WMS" className="text-[#4A6B3D]">✓ {g.wms_order_id}</span>
                      : <span className="text-[#A87B1F]" title="No WMS reference recorded">⚠ not in WMS</span>}
                  </td>
                  <td className="px-5 py-3 font-mono">{g.rows.length}</td>
                  <td className="px-5 py-3 font-mono font-semibold">{g.total_qty.toLocaleString()}</td>
                  <td className="px-5 py-3 font-mono text-[11px]">{fmtDateRange(g.required_by_date, g.required_by_date_end)}</td>
                  <td className="px-5 py-3">{g.created_by || '—'}</td>
                  <td className="px-5 py-3 cursor-pointer" onClick={() => openDetail(g)}>
                    <span className={`inline-block px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider font-semibold ${statusBadge(g.status)}`}>
                      {g.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <div className="inline-flex gap-1.5">
                      <button onClick={() => openDetail(g)} title="View detail" className="px-2 py-1 border border-[#D4D0C7] rounded text-[11px] text-[#3D3D3D] hover:bg-[#FAFAF7]">View</button>
                      <button onClick={() => openDetail(g)} title="Edit (opens detail page)" className="px-2 py-1 border border-[#D4D0C7] rounded text-[11px] text-[#3D3D3D] hover:bg-[#FAFAF7]">Edit</button>
                      {g.status !== 'fulfilled' && (
                        <button onClick={() => markComplete(g)} title="Mark all SKUs as fulfilled" className="px-2 py-1 border border-[#4A6B3D] rounded text-[11px] text-[#4A6B3D] hover:bg-[#E8EFE5]">✓ Complete</button>
                      )}
                      <button onClick={() => deleteGroup(g)} title="Delete the whole commitment" className="px-2 py-1 border border-[#A53025] rounded text-[11px] text-[#A53025] hover:bg-[#F5DEDA]">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </>
  )
}
