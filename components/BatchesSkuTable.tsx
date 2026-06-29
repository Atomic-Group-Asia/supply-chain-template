'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type Batch = {
  id: string
  sku: string
  brand: string | null
  batch_number: string
  expiry_date: string | null
  qty: number
  qty_remaining: number | null
  status: string
}

type SkuRow = {
  brand: string
  sku: string
  product_name: string
  category: string
  batch_count: number          // active batches only
  total_active: number
  total_recorded: number       // sum of qty (original) across all batches inc depleted
  earliest_active_expiry: string | null
  has_expiring: boolean        // any active batch < 90d
  has_expired: boolean
}

const BRAND_ORDER = ['Brand A', 'Brand B', 'Brand C']

function daysUntil(date: string): number {
  const d = new Date(date)
  const today = new Date()
  return Math.floor((d.getTime() - today.getTime()) / 86400000)
}

function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export function BatchesSkuTable({
  batches,
  productMap,
}: {
  batches: Batch[]
  productMap: Record<string, any>
}) {
  const [brandFilter, setBrandFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const router = useRouter()

  // Group batches by (brand, sku)
  const skuRows = useMemo<SkuRow[]>(() => {
    const map = new Map<string, SkuRow>()
    for (const b of batches) {
      const brand = b.brand || productMap[b.sku]?.brand || ''
      if (!brand) continue
      const k = `${brand}::${b.sku}`
      const p = productMap[b.sku] || {}
      const isActive = b.status === 'active' && (Number(b.qty_remaining) || 0) > 0
      const days = b.expiry_date ? daysUntil(b.expiry_date) : Infinity
      const isExpired = b.expiry_date ? days < 0 : false
      const isExpiring = b.expiry_date ? (days >= 0 && days < 90) : false

      let row = map.get(k)
      if (!row) {
        row = {
          brand,
          sku: b.sku,
          product_name: p.product_name || b.sku,
          category: p.category || '',
          batch_count: 0,
          total_active: 0,
          total_recorded: 0,
          earliest_active_expiry: null,
          has_expiring: false,
          has_expired: false,
        }
        map.set(k, row)
      }
      row.total_recorded += Number(b.qty) || 0
      if (isActive) {
        row.batch_count++
        row.total_active += Number(b.qty_remaining) || 0
        if (b.expiry_date) {
          if (!row.earliest_active_expiry || b.expiry_date < row.earliest_active_expiry) {
            row.earliest_active_expiry = b.expiry_date
          }
          if (isExpiring) row.has_expiring = true
          if (isExpired) row.has_expired = true
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      // Brand first per BRAND_ORDER, then earliest expiry asc (nulls last), then SKU
      const ai = BRAND_ORDER.indexOf(a.brand)
      const bi = BRAND_ORDER.indexOf(b.brand)
      const aIdx = ai === -1 ? 999 : ai
      const bIdx = bi === -1 ? 999 : bi
      if (aIdx !== bIdx) return aIdx - bIdx
      const ad = a.earliest_active_expiry || '9999-99-99'
      const bd = b.earliest_active_expiry || '9999-99-99'
      if (ad !== bd) return ad.localeCompare(bd)
      return a.sku.localeCompare(b.sku)
    })
  }, [batches, productMap])

  const presentBrands = useMemo(() => {
    const set = new Set<string>()
    for (const r of skuRows) set.add(r.brand)
    const ordered = BRAND_ORDER.filter(x => set.has(x))
    const extras = Array.from(set).filter(x => !BRAND_ORDER.includes(x)).sort()
    return [...ordered, ...extras]
  }, [skuRows])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return skuRows.filter(r => {
      if (brandFilter !== 'all' && r.brand !== brandFilter) return false
      if (q && !r.sku.toLowerCase().includes(q) && !r.product_name.toLowerCase().includes(q)) return false
      return true
    })
  }, [skuRows, brandFilter, search])

  function go(r: SkuRow) {
    router.push(`/batches/${encodeURIComponent(r.brand)}/${encodeURIComponent(r.sku)}`)
  }

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
        >All ({skuRows.length})</button>
        {presentBrands.map(b => (
          <button
            key={b}
            onClick={() => setBrandFilter(b)}
            className={`px-3 py-1 rounded-full text-[11px] font-mono border ${
              brandFilter === b ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white border-[#D4D0C7] hover:border-[#1A1A1A]'
            }`}
          >{b} ({skuRows.filter(x => x.brand === b).length})</button>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search SKU or product name..."
          className="flex-1 max-w-[500px] bg-white border border-[#D4D0C7] rounded px-3 py-2 text-[13px] focus:outline-none focus:border-[#C8432C]"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-[11px] font-mono text-[#6B6B6B] px-2">Clear</button>
        )}
      </div>

      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
              <th className="px-4 py-2.5">Brand</th>
              <th className="px-4 py-2.5">SKU</th>
              <th className="px-4 py-2.5">Product</th>
              <th className="px-4 py-2.5 text-right" title="Active batches only">Active Batches</th>
              <th className="px-4 py-2.5 text-right" title="Sum of qty_remaining across active batches">Total Active</th>
              <th className="px-4 py-2.5" title="Earliest expiry across active batches">Earliest Expiry</th>
              <th className="px-4 py-2.5 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[#6B6B6B]">
                  <div className="text-[14px] mb-1">No batches match</div>
                  <div className="text-[11px]">Click "+ New Batch" to record a batch with its real OEM batch number and expiry date.</div>
                </td>
              </tr>
            )}
            {filtered.map(r => {
              const earliestDays = r.earliest_active_expiry ? daysUntil(r.earliest_active_expiry) : Infinity
              const expColor =
                r.has_expired ? 'text-[#A53025] font-semibold' :
                earliestDays < 30 ? 'text-[#C8432C] font-semibold' :
                earliestDays < 90 ? 'text-[#B8860B]' :
                'text-[#4A6B3D]'
              return (
                <tr
                  key={`${r.brand}::${r.sku}`}
                  className="border-t border-[#F0EDE4] hover:bg-[#FAFAF7] cursor-pointer"
                  onClick={() => go(r)}
                >
                  <td className="px-4 py-2.5">
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-[#E8E5DE] text-[#3D3D3D] font-mono">{r.brand}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[#C8432C]">{r.sku}</td>
                  <td className="px-4 py-2.5">{r.product_name}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{r.batch_count}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{r.total_active.toLocaleString()}</td>
                  <td className={`px-4 py-2.5 font-mono text-[11px] ${expColor}`}>
                    {r.earliest_active_expiry ? fmtDate(r.earliest_active_expiry) : '—'}
                    {r.earliest_active_expiry && (
                      <span className="ml-2 text-[10px] text-[#6B6B6B]">
                        ({earliestDays >= 0 ? `${earliestDays}d` : `${Math.abs(earliestDays)}d expired`})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[#6B6B6B] text-right">›</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
