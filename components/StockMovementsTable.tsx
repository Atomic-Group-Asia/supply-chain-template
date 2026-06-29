'use client'

import { useState, useMemo } from 'react'

const fmt = (n: number | null) => n == null ? '—' : n.toLocaleString()

const getMonthKey = (date: string | null) => date ? date.substring(0, 7) : ''
const getMonthLabel = (key: string) => key ? new Date(key + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'long' }) : 'Unknown'
const getMonthShort = (key: string) => key ? new Date(key + '-01').toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : 'Unknown'

const BRAND_ORDER = ['Brand A', 'Brand B', 'Brand C']

function sortByOrder(values: string[], order: string[]): string[] {
  const present = new Set(values)
  const ordered = order.filter(v => present.has(v))
  const extras = values.filter(v => !order.includes(v)).sort()
  return [...ordered, ...extras]
}

type SortKey = 'sku' | 'date_start' | 'date_end' | 'starting' | 'in_qty' | 'out_qty' | 'closing' | 'change_qty' | 'warehouse' | null
type SortDir = 'asc' | 'desc'

export function StockMovementsTable({ movements }: { movements: any[] }) {
  const [selectedMonth, setSelectedMonth] = useState<string>('All')
  const [selectedBrand, setSelectedBrand] = useState<string>('All')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const brands = useMemo(() => {
    const set = new Set(movements.map(m => m.brand).filter(Boolean))
    return ['All', ...sortByOrder(Array.from(set), BRAND_ORDER)]
  }, [movements])

  const months = useMemo(() => {
    const pool = selectedBrand === 'All' ? movements : movements.filter(m => m.brand === selectedBrand)
    const set = new Set(pool.map(m => getMonthKey(m.date_start)).filter(Boolean))
    return ['All', ...Array.from(set).sort().reverse()]
  }, [movements, selectedBrand])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return movements.filter(m => {
      if (selectedBrand !== 'All' && m.brand !== selectedBrand) return false
      if (selectedMonth !== 'All' && getMonthKey(m.date_start) !== selectedMonth) return false
      if (q && !m.sku?.toLowerCase().includes(q) && !m.warehouse?.toLowerCase().includes(q)) return false
      return true
    })
  }, [movements, selectedBrand, selectedMonth, search])

  const sortRows = (rows: any[]) => {
    if (!sortKey) return rows
    const arr = [...rows]
    arr.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const aEmpty = av == null || av === ''
      const bEmpty = bv == null || bv === ''
      if (aEmpty && bEmpty) return 0
      if (aEmpty) return 1
      if (bEmpty) return -1
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const as = String(av).toLowerCase()
      const bs = String(bv).toLowerCase()
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as)
    })
    return arr
  }

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const m of filtered) {
      const key = getMonthKey(m.date_start) || 'Unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [filtered])

  function toggleSort(k: Exclude<SortKey, null>) {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  function arrow(k: Exclude<SortKey, null>) {
    if (sortKey !== k) return <span style={{ opacity: 0.3, marginLeft: '6px' }}>↕</span>
    return <span style={{ marginLeft: '6px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const sortableHeaderClass = "text-left px-7 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold whitespace-nowrap cursor-pointer select-none hover:text-[#1A1A1A]"

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search SKU, warehouse..."
          className="flex-1 max-w-[400px] bg-white border border-[#D4D0C7] rounded px-3 py-2 text-[13px] focus:outline-none focus:border-[#C8432C]"
        />
        <span className="ml-auto text-[11px] font-mono text-[#6B6B6B]">
          {filtered.length} of {movements.length}
        </span>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] min-w-[60px] font-semibold">Brand</span>
        {brands.map(b => {
          const active = selectedBrand === b
          return (
            <button
              key={b}
              onClick={() => { setSelectedBrand(b); setSelectedMonth('All') }}
              className={`px-3 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                active ? 'bg-[#1A1A1A] text-[#FAFAF7] border-[#1A1A1A]' : 'bg-white border-[#D4D0C7] text-[#3D3D3D] hover:border-[#1A1A1A]'
              }`}
            >
              {b}
            </button>
          )
        })}
      </div>

      <div className="flex gap-2 mb-6 flex-wrap items-center">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] min-w-[60px] font-semibold">Month</span>
        {months.map(m => {
          const label = m === 'All' ? 'All' : getMonthShort(m)
          const active = selectedMonth === m
          return (
            <button
              key={m}
              onClick={() => setSelectedMonth(m)}
              className={`px-3 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                active ? 'bg-[#C8432C] text-[#FAFAF7] border-[#C8432C]' : 'bg-white border-[#D4D0C7] text-[#3D3D3D] hover:border-[#1A1A1A]'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {grouped.length === 0 && (
        <div className="bg-white border border-[#D4D0C7] rounded p-12 text-center text-[#6B6B6B]">
          <div className="text-sm">No movements yet.</div>
          <div className="text-xs mt-1">Click <strong>↑ Upload Excel</strong> to import.</div>
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(([monthKey, rawRows]) => {
          const monthLabel = monthKey === 'Unknown' ? 'Unknown date' : getMonthLabel(monthKey)
          const totalIn = rawRows.reduce((s, r) => s + (r.in_qty || 0), 0)
          const totalOut = rawRows.reduce((s, r) => s + (r.out_qty || 0), 0)
          const rows = sortRows(rawRows)
          return (
            <div key={monthKey} className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
              <div className="bg-[#FAFAF7] border-b border-[#D4D0C7] px-7 py-4 flex justify-between items-center">
                <div>
                  <div className="font-medium text-base">{monthLabel}</div>
                  <div className="font-mono text-[11px] text-[#6B6B6B] mt-0.5">{rows.length} records</div>
                </div>
                <div className="flex gap-8 text-right">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">Total In</div>
                    <div className="font-mono font-semibold text-[#4A6B3D] text-base">+{fmt(totalIn)}</div>
                  </div>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">Total Out</div>
                    <div className="font-mono font-semibold text-[#A53025] text-base">-{fmt(totalOut)}</div>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-white border-b border-[#E8E5DE]">
                    <tr>
                      <th className="text-left px-7 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold whitespace-nowrap">Brand</th>
                      <th className={sortableHeaderClass} onClick={() => toggleSort('sku')}>SKU{arrow('sku')}</th>
                      <th className={sortableHeaderClass} onClick={() => toggleSort('date_start')}>Period Start{arrow('date_start')}</th>
                      <th className={sortableHeaderClass} onClick={() => toggleSort('date_end')}>Period End{arrow('date_end')}</th>
                      <th className={sortableHeaderClass} onClick={() => toggleSort('starting')}>Opening{arrow('starting')}</th>
                      <th className={sortableHeaderClass} onClick={() => toggleSort('in_qty')}>In{arrow('in_qty')}</th>
                      <th className={sortableHeaderClass} onClick={() => toggleSort('out_qty')}>Out{arrow('out_qty')}</th>
                      <th className={sortableHeaderClass} onClick={() => toggleSort('closing')}>Closing{arrow('closing')}</th>
                      <th className={sortableHeaderClass} onClick={() => toggleSort('change_qty')}>Change{arrow('change_qty')}</th>
                      <th className={sortableHeaderClass} onClick={() => toggleSort('warehouse')}>Warehouse{arrow('warehouse')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-[#E8E5DE] last:border-b-0 hover:bg-[#FAFAF7]">
                        <td className="px-7 py-3">
                          {r.brand && <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-[#E8E5DE] text-[#3D3D3D]">{r.brand}</span>}
                        </td>
                        <td className="px-7 py-3 font-mono text-[11px] font-medium whitespace-nowrap">{r.sku}</td>
                        <td className="px-7 py-3 font-mono text-[11px]">{r.date_start || '—'}</td>
                        <td className="px-7 py-3 font-mono text-[11px]">{r.date_end || '—'}</td>
                        <td className="px-7 py-3 font-mono text-right text-[#6B6B6B]">{fmt(r.starting)}</td>
                        <td className="px-7 py-3 font-mono text-right text-[#4A6B3D]">{r.in_qty ? `+${r.in_qty.toLocaleString()}` : '—'}</td>
                        <td className="px-7 py-3 font-mono text-right text-[#A53025]">{r.out_qty ? `-${r.out_qty.toLocaleString()}` : '—'}</td>
                        <td className="px-7 py-3 font-mono text-right font-semibold">{fmt(r.closing)}</td>
                        <td className="px-7 py-3 font-mono text-right text-[#6B6B6B]">{r.change_qty != null ? (r.change_qty > 0 ? '+' : '') + r.change_qty.toLocaleString() : '—'}</td>
                        <td className="px-7 py-3 text-[11px] text-[#6B6B6B]">{r.warehouse || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}