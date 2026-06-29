'use client'

import { useState, useMemo } from 'react'
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

export function BatchesTable({ batches, productMap }: { batches: Batch[]; productMap: Record<string, any> }) {
  const [filter, setFilter] = useState<'all' | 'expiring' | 'expired' | 'active'>('all')
  const [brandFilter, setBrandFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Batch | null>(null)
  const router = useRouter()

  const enriched = useMemo(() => batches.map(b => {
    const days = b.expiry_date ? daysUntil(b.expiry_date) : Infinity
    const isExpired = b.expiry_date ? days < 0 : false
    const isExpiring = b.expiry_date ? (days >= 0 && days < 90) : false
    return { ...b, daysUntilExpiry: days, isExpired, isExpiring, _product: productMap[b.sku] }
  }), [batches, productMap])

  // Brand list — group MY + SG pairs, keep order consistent across the app
  const BRAND_ORDER = ['Nattome', 'NattomeSG', 'Heartio', 'HeartioSG', 'TPD', 'HJT', 'HooHoo', 'Stonecare']
  const presentBrands = useMemo(() => {
    const set = new Set<string>()
    for (const b of enriched) if (b.brand) set.add(b.brand)
    const ordered = BRAND_ORDER.filter(x => set.has(x))
    const extras = Array.from(set).filter(x => !BRAND_ORDER.includes(x)).sort()
    return [...ordered, ...extras]
  }, [enriched])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return enriched.filter(b => {
      if (brandFilter !== 'all' && b.brand !== brandFilter) return false
      if (filter === 'expiring' && !b.isExpiring) return false
      if (filter === 'expired' && !b.isExpired) return false
      if (filter === 'active' && (b.status !== 'active' || b.isExpired)) return false
      if (q && !b.sku.toLowerCase().includes(q) && !b.batch_number.toLowerCase().includes(q) && !(b._product?.product_name || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [enriched, filter, brandFilter, search])

  // Counts apply the brand filter so the status tabs reflect what the
  // user is actually looking at.
  const brandScoped = brandFilter === 'all' ? enriched : enriched.filter(b => b.brand === brandFilter)
  const tabs: { key: typeof filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: brandScoped.length },
    { key: 'active', label: 'Active', count: brandScoped.filter(b => b.status === 'active' && !b.isExpired).length },
    { key: 'expiring', label: 'Expiring < 90 days', count: brandScoped.filter(b => b.isExpiring).length },
    { key: 'expired', label: 'Expired', count: brandScoped.filter(b => b.isExpired).length },
  ]

  return (
    <>
      {/* Brand filter chips */}
      <div className="mb-3 flex gap-2 flex-wrap items-center">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] min-w-[60px] font-semibold">Brand</span>
        <button
          onClick={() => setBrandFilter('all')}
          className={`px-3 py-1 rounded-full text-[11px] font-mono border ${
            brandFilter === 'all' ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white border-[#D4D0C7] hover:border-[#1A1A1A]'
          }`}
        >All ({enriched.length})</button>
        {presentBrands.map(b => (
          <button
            key={b}
            onClick={() => setBrandFilter(b)}
            className={`px-3 py-1 rounded-full text-[11px] font-mono border ${
              brandFilter === b ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white border-[#D4D0C7] hover:border-[#1A1A1A]'
            }`}
          >{b} ({enriched.filter(x => x.brand === b).length})</button>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search SKU, batch #, product name..."
          className="flex-1 max-w-[500px] bg-white border border-[#D4D0C7] rounded px-3 py-2 text-[13px] focus:outline-none focus:border-[#C8432C]"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-[11px] font-mono text-[#6B6B6B] px-2">Clear</button>
        )}
        <div className="flex gap-2 ml-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-mono ${
                filter === t.key ? 'bg-[#1A1A1A] text-white' : 'border border-[#D4D0C7] hover:bg-[#FAFAF7]'
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
              <th className="px-4 py-2.5">SKU</th>
              <th className="px-4 py-2.5">Product</th>
              <th className="px-4 py-2.5">Brand</th>
              <th className="px-4 py-2.5">Category</th>
              <th className="px-4 py-2.5">Batch No.</th>
              <th className="px-4 py-2.5">Mfg Date</th>
              <th className="px-4 py-2.5">Expiry Date</th>
              <th className="px-4 py-2.5 text-right">Days Until Expiry</th>
              <th className="px-4 py-2.5 text-right">Qty</th>
              <th className="px-4 py-2.5">Warehouse</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-[#6B6B6B]">
                  <div className="text-[14px] mb-1">No batches recorded yet</div>
                  <div className="text-[11px]">Insert into <code>batches</code> table to enable expiry alerts.</div>
                </td>
              </tr>
            )}
            {filtered.map(b => {
              const days = b.daysUntilExpiry
              const isCritical = b.isExpired || (days >= 0 && days < 30)
              return (
                <tr
                  key={b.id}
                  className="border-t border-[#F0EDE4] hover:bg-[#FAFAF7] cursor-pointer"
                  onClick={() => setEditing(b)}
                  title="Click to edit"
                >
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#C8432C]">{b.sku}</td>
                  <td className="px-4 py-2.5">{b._product?.product_name || '—'}</td>
                  <td className="px-4 py-2.5 text-[12px]">{b.brand || b._product?.brand || '—'}</td>
                  <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                    <CategoryCell sku={b.sku} value={b._product?.category || ''} />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">{b.batch_number}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">{b.manufactured_date || '—'}</td>
                  <td className={`px-4 py-2.5 font-mono text-[11px] ${isCritical ? 'text-[#C8432C] font-semibold' : ''}`}>{b.expiry_date}</td>
                  <td className={`px-4 py-2.5 text-right font-mono text-[12px] ${isCritical ? 'text-[#C8432C] font-semibold' : b.isExpiring ? 'text-[#B8860B]' : 'text-[#4A6B3D]'}`}>
                    {b.isExpired ? `${Math.abs(days)} expired` : `${days} days`}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{Number(b.qty_remaining ?? b.qty).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-[12px]">{b.warehouse || '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${statusColor[b.status] || statusColor.active}`}>
                      {b.isExpired ? 'EXPIRED' : b.status}
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
          brand={editing.brand || ''}
          sku={editing.sku}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh() }}
        />
      )}
    </>
  )
}

// ── Inline-editable category cell ──────────────────────────────────────
const CATEGORY_OPTIONS = ['Product', 'Merchandise', 'Free Gift', 'Inactive', 'Others']

function CategoryCell({ sku, value }: { sku: string; value: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [current, setCurrent] = useState(value)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save(next: string) {
    if (next === current) { setEditing(false); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch('/api/sku-mapping/category', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, category: next }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Save failed'); return }
      setCurrent(next)
      setEditing(false)
      router.refresh()
    } finally { setSaving(false) }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <select
          autoFocus
          value={current}
          onChange={e => save(e.target.value)}
          onBlur={() => !saving && setEditing(false)}
          disabled={saving}
          className="px-1.5 py-0.5 border border-[#C8432C] rounded text-[10px] bg-white"
        >
          <option value="">—</option>
          {CATEGORY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {saving && <span className="text-[10px] text-[#6B6B6B]">…</span>}
        {err && <span className="text-[10px] text-[#A53025]" title={err}>!</span>}
      </div>
    )
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="inline-block px-2 py-0.5 rounded text-[10px] bg-[#DDE8EF] text-[#2C5F7C] hover:bg-[#C9DCE6] cursor-pointer"
      title="Click to change category (writes back to SKU Mapping gsheet)"
    >
      {current || <span className="text-[#6B6B6B]">+ set</span>}
    </button>
  )
}
