'use client'

import { useState, useMemo } from 'react'

type Row = { brand: string; sku: string; product_name: string; qty: number }

const fmt = (n: number) => n.toLocaleString()

const BRAND_ORDER = ['Brand A', 'Brand B', 'Brand C']

/** Shared table for HQ Stock + O2O Stock pages. Search + brand filter +
 *  click-to-sort. Lightweight on purpose — these are reference views
 *  (no editing). */
export function StockChannelTable({ rows }: { rows: Row[] }) {
  const [search, setSearch] = useState('')
  const [brand, setBrand] = useState<string>('All')
  const [sortKey, setSortKey] = useState<'brand' | 'sku' | 'product_name' | 'qty' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const brands = useMemo(() => {
    const present = new Set<string>()
    for (const r of rows) if (r.brand) present.add(r.brand)
    const ordered = BRAND_ORDER.filter(b => present.has(b))
    const extras = Array.from(present).filter(b => !BRAND_ORDER.includes(b)).sort()
    return ['All', ...ordered, ...extras]
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    let out = rows.filter(r => {
      if (brand !== 'All' && r.brand !== brand) return false
      if (q && !r.sku.toLowerCase().includes(q) && !r.product_name.toLowerCase().includes(q)) return false
      return true
    })
    if (sortKey) {
      out = [...out].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey]
        if (typeof av === 'number' && typeof bv === 'number') {
          return sortDir === 'asc' ? av - bv : bv - av
        }
        const as = String(av || '').toLowerCase()
        const bs = String(bv || '').toLowerCase()
        return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as)
      })
    }
    return out
  }, [rows, brand, search, sortKey, sortDir])

  function toggleSort(k: typeof sortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  const totalQty = filtered.reduce((s, r) => s + r.qty, 0)

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search SKU or product name…"
          className="flex-1 max-w-[500px] bg-white border border-[#D4D0C7] rounded px-3 py-2 text-[13px] focus:outline-none focus:border-[#C8432C]"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-[11px] font-mono text-[#6B6B6B] px-2">Clear</button>
        )}
        <span className="ml-auto text-[11px] font-mono text-[#6B6B6B]">
          Showing {filtered.length} of {rows.length} · total qty {fmt(totalQty)}
        </span>
      </div>

      <div className="mb-4 flex gap-2 flex-wrap items-center">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] min-w-[60px] font-semibold">Brand</span>
        {brands.map(b => {
          const count = b === 'All' ? rows.length : rows.filter(x => x.brand === b).length
          const active = brand === b
          return (
            <button
              key={b}
              onClick={() => setBrand(b)}
              className={`px-3 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                active ? 'bg-[#1A1A1A] text-[#FAFAF7] border-[#1A1A1A]' : 'bg-white border-[#D4D0C7] text-[#3D3D3D] hover:border-[#1A1A1A]'
              }`}
            >
              {b} ({count})
            </button>
          )
        })}
      </div>

      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
                <th className="px-5 py-3 cursor-pointer select-none hover:text-[#1A1A1A]" onClick={() => toggleSort('brand')}>
                  Brand {sortKey === 'brand' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-5 py-3 cursor-pointer select-none hover:text-[#1A1A1A]" onClick={() => toggleSort('sku')}>
                  SKU {sortKey === 'sku' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-5 py-3 cursor-pointer select-none hover:text-[#1A1A1A]" onClick={() => toggleSort('product_name')}>
                  Product {sortKey === 'product_name' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-5 py-3 text-right cursor-pointer select-none hover:text-[#1A1A1A]" onClick={() => toggleSort('qty')}>
                  Stock {sortKey === 'qty' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-[#6B6B6B]">
                  No rows match the current filters.
                </td></tr>
              )}
              {filtered.map((r, i) => (
                <tr key={`${r.brand}::${r.sku}::${i}`} className="border-b border-[#F0EDE4] last:border-0 hover:bg-[#FAFAF7]">
                  <td className="px-5 py-3">
                    {r.brand && <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-[#E8E5DE] text-[#3D3D3D]">{r.brand}</span>}
                  </td>
                  <td className="px-5 py-3 font-mono font-medium text-[13px] text-[#C8432C]">{r.sku}</td>
                  <td className="px-5 py-3">{r.product_name || '—'}</td>
                  <td className="px-5 py-3 font-mono text-right font-semibold">{fmt(r.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
