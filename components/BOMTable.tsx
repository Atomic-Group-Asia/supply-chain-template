'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const BRAND_ORDER = ['Nattome', 'NattomeSG', 'Heartio', 'HeartioSG', 'TPD', 'HJT', 'HooHoo', 'Stonecare']

export function BOMTable({ boms, products, packaging, suppliers }: { boms: any[]; products: any[]; packaging: any[]; suppliers: any[] }) {
  // packaging, suppliers unused at the list level — full editor lives on
  // the product detail BOM tab.
  void packaging; void suppliers
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [brandFilter, setBrandFilter] = useState<string>('All')
  const [busy, setBusy] = useState<string | null>(null)

  const productMap = useMemo(() => new Map(products.map(p => [p.sku, p])), [products])

  async function deleteAllForSku(sku: string, lines: any[]) {
    if (!confirm(`Delete all ${lines.length} BOM lines for ${sku}? This removes the entire BOM for this SKU.`)) return
    setBusy(`all-${sku}`)
    try {
      for (const ln of lines) {
        await fetch(`/api/bom/${ln.id}`, { method: 'DELETE' })
      }
      router.refresh()
    } finally { setBusy(null) }
  }

  // Brand chips derived from product lookups so we only show brands that
  // actually have BOM entries.
  const presentBrands = useMemo(() => {
    const set = new Set<string>()
    for (const b of boms) {
      const brand = productMap.get(b.product_sku)?.brand
      if (brand) set.add(brand)
    }
    const ordered = BRAND_ORDER.filter(b => set.has(b))
    const extras = Array.from(set).filter(b => !BRAND_ORDER.includes(b)).sort()
    return [...ordered, ...extras]
  }, [boms, productMap])
  const brandCount = (b: string) => b === 'All'
    ? boms.length
    : boms.filter(x => productMap.get(x.product_sku)?.brand === b).length

  const filteredBoms = useMemo(() => {
    const q = search.toLowerCase().trim()
    return boms.filter(b => {
      const product = productMap.get(b.product_sku)
      if (brandFilter !== 'All' && product?.brand !== brandFilter) return false
      if (!q) return true
      return (
        b.product_sku?.toLowerCase().includes(q) ||
        b.packaging_code?.toLowerCase().includes(q) ||
        b.source?.toLowerCase().includes(q) ||
        b.notes?.toLowerCase().includes(q) ||
        product?.product_name?.toLowerCase().includes(q)
      )
    })
  }, [boms, search, brandFilter, productMap])

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const b of filteredBoms) {
      if (!map.has(b.product_sku)) map.set(b.product_sku, [])
      map.get(b.product_sku)!.push(b)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredBoms])

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search SKU, packaging, source, product name..."
          className="flex-1 max-w-[500px] bg-white border border-[#D4D0C7] rounded px-3 py-2 text-[13px] focus:outline-none focus:border-[#C8432C]"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-[11px] font-mono text-[#6B6B6B] px-2">Clear</button>
        )}
        <span className="ml-auto text-[11px] font-mono text-[#6B6B6B]">
          {grouped.length} SKU{grouped.length !== 1 ? 's' : ''} · {filteredBoms.length} BOM lines
        </span>
      </div>

      <div className="mb-4 flex gap-1.5 flex-wrap items-center">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] min-w-[60px] font-semibold">Brand</span>
        <button
          onClick={() => setBrandFilter('All')}
          className={`px-3 py-1 rounded-full text-[11px] font-mono border ${
            brandFilter === 'All' ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white border-[#D4D0C7] hover:border-[#1A1A1A]'
          }`}
        >All ({brandCount('All')})</button>
        {presentBrands.map(b => (
          <button
            key={b}
            onClick={() => setBrandFilter(b)}
            className={`px-3 py-1 rounded-full text-[11px] font-mono border ${
              brandFilter === b ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white border-[#D4D0C7] hover:border-[#1A1A1A]'
            }`}
          >{b} ({brandCount(b)})</button>
        ))}
      </div>

      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
        {grouped.length === 0 && (
          <div className="px-7 py-12 text-center text-[#6B6B6B]">No BOM entries match your search</div>
        )}
        <table className="w-full text-[13px]">
          <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
              <th className="px-5 py-3">SKU</th>
              <th className="px-5 py-3">Product Name</th>
              <th className="px-5 py-3">Brand</th>
              <th className="px-5 py-3 text-right">Components</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map(([sku, lines]) => {
              const product = productMap.get(sku)
              return (
                <tr
                  key={sku}
                  onClick={() => router.push(`/products/${encodeURIComponent(sku)}?tab=bom`)}
                  className="border-t border-[#E8E5DE] hover:bg-[#FAFAF7] cursor-pointer"
                >
                  <td className="px-5 py-3">
                    <Link href={`/products/${encodeURIComponent(sku)}?tab=bom`} className="font-mono text-[12px] text-[#C8432C] hover:underline" onClick={e => e.stopPropagation()}>{sku}</Link>
                  </td>
                  <td className="px-5 py-3">{product?.product_name || sku}</td>
                  <td className="px-5 py-3 text-[#6B6B6B]">{product?.brand || '—'}</td>
                  <td className="px-5 py-3 text-right font-mono text-[12px]">{lines.length} component{lines.length !== 1 ? 's' : ''}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <Link
                      href={`/products/${encodeURIComponent(sku)}?tab=bom`}
                      className="inline-block mr-1.5 px-2.5 py-1 border border-[#D4D0C7] rounded text-[11px] hover:bg-[#FAFAF7]"
                    >Edit</Link>
                    <button
                      onClick={() => deleteAllForSku(sku, lines)}
                      disabled={busy === `all-${sku}`}
                      className="px-2.5 py-1 border border-[#A53025] text-[#A53025] rounded text-[11px] hover:bg-[#F5DEDA] disabled:opacity-50"
                    >Delete all</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

