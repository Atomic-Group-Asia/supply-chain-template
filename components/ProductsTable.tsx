'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const brands = ['All', 'Nattome', 'Heartio', 'TPD', 'HJT', 'HooHoo', 'Stonecare']

export function ProductsTable({ products, suppliers }: { products: any[]; suppliers: any[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialBrand = searchParams?.get('brand') || 'All'
  const [filterBrand, setFilterBrand] = useState(initialBrand)
  const [search, setSearch] = useState('')

  const supplierMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of suppliers) m.set(s.supplier_code, s.supplier_name)
    return m
  }, [suppliers])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return products.filter(p => {
      if (filterBrand !== 'All' && p.brand !== filterBrand) return false
      if (q && !p.sku?.toLowerCase().includes(q) && !p.product_name?.toLowerCase().includes(q) && !p.barcode?.toLowerCase().includes(q)) return false
      return true
    })
  }, [products, filterBrand, search])

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search SKU, product name, barcode..."
          className="flex-1 max-w-[500px] bg-white border border-[#D4D0C7] rounded px-3 py-2 text-[13px] focus:outline-none focus:border-[#C8432C]"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-[11px] font-mono text-[#6B6B6B] px-2">Clear</button>
        )}
        <span className="ml-auto text-[11px] font-mono text-[#6B6B6B]">
          Showing {filtered.length} of {products.length}
        </span>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {brands.map(b => {
          const count = b === 'All' ? products.length : products.filter(p => p.brand === b).length
          const active = filterBrand === b
          return (
            <button
              key={b}
              onClick={() => setFilterBrand(b)}
              className={`px-3 py-1 rounded-full text-[11px] font-mono border transition-colors ${
                active ? 'bg-[#1A1A1A] text-[#FAFAF7] border-[#1A1A1A]' : 'bg-white border-[#D4D0C7] text-[#3D3D3D] hover:border-[#1A1A1A]'
              }`}
            >
              {b} {count > 0 && <span className="opacity-60">({count})</span>}
            </button>
          )
        })}
      </div>

      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
            <tr>
              {['SKU','Product','Brand'].map(h => (
                <th key={h} className="text-left px-3 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold whitespace-nowrap">{h}</th>
              ))}
              <th className="text-right px-3 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold whitespace-nowrap" title="On-hand from daily upload">Available</th>
              {['MOQ','Lead (d)'].map(h => (
                <th key={h} className="text-left px-3 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold whitespace-nowrap">{h}</th>
              ))}
              <th className="text-right px-3 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold whitespace-nowrap" title="Months of cover at current velocity — Available only, incoming POs not factored in (lowest = most urgent)">Months Left</th>
              <th className="text-right px-3 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold whitespace-nowrap" title="Average monthly sales (L3M → L6M → LM fallback)">Avg/mo</th>
              <th className="text-left px-3 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold whitespace-nowrap">Status</th>
              <th className="text-right px-3 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold">›</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr
                key={p.id}
                className="border-b border-[#E8E5DE] hover:bg-[#FAFAF7] cursor-pointer transition-colors"
                onClick={() => router.push(`/products/${encodeURIComponent(p.sku)}`)}
              >
                <td className="px-3 py-3 font-mono text-[11px] font-medium whitespace-nowrap text-[#C8432C]">{p.sku}</td>
                <td className="px-3 py-3 font-medium">{p.product_name}</td>
                <td className="px-3 py-3">
                  {p.brand && <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-[#E8E5DE] text-[#3D3D3D]">{p.brand}</span>}
                </td>
                <td className="px-3 py-3 font-mono text-right">{p.available != null ? p.available.toLocaleString() : '—'}</td>
                <td className="px-3 py-3 font-mono">{p.moq != null ? p.moq.toLocaleString() : '—'}</td>
                <td className="px-3 py-3 font-mono">{p.lead_time_days != null ? p.lead_time_days : '—'}</td>
                <td className={`px-3 py-3 font-mono text-right ${
                  p.months_left == null ? 'text-[#6B6B6B]' :
                  p.months_left < 2.5 ? 'text-[#C8432C] font-semibold' :
                  p.months_left < 3.5 ? 'text-[#B8860B]' : ''
                }`}>
                  {p.months_left == null ? 'no data' : p.months_left.toFixed(2)}
                  {p.incoming > 0 && (
                    <div className="text-[9px] text-[#4A6B3D] font-normal mt-0.5" title={`${p.incoming.toLocaleString()} units on approved POs — not counted in Months Left`}>
                      +{p.incoming.toLocaleString()} incoming
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 font-mono text-right">
                  <span className="sensitive">
                    {p.avg_per_month == null ? '—' : Math.round(p.avg_per_month).toLocaleString()}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-block px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider font-semibold ${
                    p.product_status === 'active' ? 'bg-[#E4EDE0] text-[#4A6B3D]' :
                    p.product_status === 'development' ? 'bg-[#DDE8EF] text-[#2C5F7C]' :
                    'bg-[#F5EDD6] text-[#B8860B]'
                  }`}>{p.product_status}</span>
                </td>
                <td className="px-3 py-3 text-right text-[#6B6B6B] font-mono">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[10px] font-mono text-[#6B6B6B]">
        OEM supplier · unit cost · selling price · barcode · KKM no. · etc — click a row to view full product details.
      </div>
    </>
  )
}