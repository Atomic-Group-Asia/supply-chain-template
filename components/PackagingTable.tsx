'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { EditPackagingModal } from './EditPackagingModal'

const KNOWN_BRANDS = ['Brand A', 'Brand B', 'Brand C']
const BRAND_ORDER = ['Brand A', 'Brand B', 'Brand C']

function getBrand(p: any): string {
  // 1. Explicit brand column (preferred — set via Create/Edit modal)
  if (p.brand && KNOWN_BRANDS.includes(p.brand)) return p.brand
  // 2. Legacy: packaging_type was overloaded to also carry brand
  if (p.packaging_type && KNOWN_BRANDS.includes(p.packaging_type)) return p.packaging_type
  // 3. Code-prefix fallback for pre-migration rows
  const code = p.packaging_code || ''
  if (code.startsWith('N-')) return 'Nattome'
  if (code.startsWith('HH')) return 'HooHoo'
  if (code.startsWith('KOPTINO') || code.startsWith('MLTGRN') || code.startsWith('KH') || code.startsWith('KG') || code.startsWith('TP') || code.startsWith('NR') || code.startsWith('MULTIGRAIN')) return 'Heartio'
  return 'Other'
}

function sortByOrder(values: string[], order: string[]): string[] {
  const present = new Set(values)
  const ordered = order.filter(v => present.has(v))
  const extras = values.filter(v => !order.includes(v)).sort()
  return [...ordered, ...extras]
}

export function PackagingTable({ packaging, suppliers, bomQtyByCode = {}, incomingByCode = {} }: { packaging: any[]; suppliers: any[]; bomQtyByCode?: Record<string, number>; incomingByCode?: Record<string, number> }) {
  const router = useRouter()
  const [editing, setEditing] = useState<any | null>(null)
  const [search, setSearch] = useState('')
  const searchParams = useSearchParams()
  const initialBrand = searchParams?.get('brand') || 'All'
  const [filterBrand, setFilterBrand] = useState(initialBrand)

  const supplierMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of suppliers) m.set(s.supplier_code, s.supplier_name)
    return m
  }, [suppliers])

  const enriched = useMemo(() =>
    packaging.map(p => ({ ...p, _brand: getBrand(p) })),
    [packaging]
  )

  const brands = useMemo(() => {
    const present = Array.from(new Set(enriched.map(p => p._brand)))
    return ['All', ...sortByOrder(present, BRAND_ORDER)]
  }, [enriched])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return enriched.filter(p => {
      if (filterBrand !== 'All' && p._brand !== filterBrand) return false
      if (q) {
        return (
          p.packaging_code?.toLowerCase().includes(q) ||
          p.packaging_name?.toLowerCase().includes(q) ||
          p.packaging_type?.toLowerCase().includes(q) ||
          p.supplier_code?.toLowerCase().includes(q) ||
          p.notes?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [enriched, filterBrand, search])

  const brandCount = (b: string) =>
    b === 'All' ? enriched.length : enriched.filter(p => p._brand === b).length

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search code, name, type, supplier..."
          className="flex-1 max-w-[500px] bg-white border border-[#D4D0C7] rounded px-3 py-2 text-[13px] focus:outline-none focus:border-[#C8432C]"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-[11px] font-mono text-[#6B6B6B] px-2">Clear</button>
        )}
        <span className="ml-auto text-[11px] font-mono text-[#6B6B6B]">
          Showing {filtered.length} of {enriched.length}
        </span>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {brands.map(b => {
          const count = brandCount(b)
          const active = filterBrand === b
          return (
            <button
              key={b}
              onClick={() => setFilterBrand(b)}
              className={`px-3 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                active ? 'bg-[#1A1A1A] text-[#FAFAF7] border-[#1A1A1A]' : 'bg-white border-[#D4D0C7] text-[#3D3D3D] hover:border-[#1A1A1A]'
              }`}
            >
              {b} <span className="opacity-60">({count})</span>
            </button>
          )
        })}
      </div>

      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
            <tr>
              {['Code','Name','Type','Supplier','Stock','Incoming'].map(h => (
                <th key={h} className="text-left px-3 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold whitespace-nowrap">{h}</th>
              ))}
              <th className="text-right px-3 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold">›</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr
                key={p.id}
                className="border-b border-[#E8E5DE] hover:bg-[#FAFAF7] cursor-pointer transition-colors"
                onClick={() => router.push(`/packaging/${encodeURIComponent(p.packaging_code)}`)}
              >
                <td className="px-3 py-3 font-mono text-[11px] font-medium whitespace-nowrap text-[#C8432C]">{p.packaging_code}</td>
                <td className="px-3 py-3">{p.packaging_name}</td>
                <td className="px-3 py-3">
                  {p.packaging_type && !KNOWN_BRANDS.includes(p.packaging_type) && (
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-[#DDE8EF] text-[#2C5F7C]">{p.packaging_type}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-[12px]">
                  {p.supplier_code ? <span className="sensitive">{supplierMap.get(p.supplier_code) || p.supplier_code}</span> : '—'}
                </td>
                <td className="px-3 py-3 font-mono">
                  {p.stock_balance != null ? Number(p.stock_balance).toLocaleString() : '—'}
                </td>
                <td className="px-3 py-3 font-mono text-[#4A6B3D]">
                  {(incomingByCode[p.packaging_code] || 0) > 0
                    ? `+${incomingByCode[p.packaging_code].toLocaleString()}`
                    : '—'}
                </td>
                <td className="px-3 py-3 text-right text-[#6B6B6B] font-mono">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[10px] font-mono text-[#6B6B6B]">
        Brand · Cost · UOM · MOQ · Lead · Notes — click a row to view full packaging details.
      </div>

      {editing && <EditPackagingModal packaging={editing} suppliers={suppliers} onClose={() => setEditing(null)} />}
    </>
  )
}