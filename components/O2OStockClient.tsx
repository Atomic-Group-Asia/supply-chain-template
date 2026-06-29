'use client'

import { useState, useMemo, useEffect } from 'react'

type Shop = {
  brand: string
  shop_code: string
  shop_name: string
  total_qty: number
  skus: { sku: string; product_name: string; qty: number }[]
}
type Pivot = {
  brand: string
  sku: string
  product_name: string
  total: number
  per_shop: { shop_code: string; shop_name: string; qty: number }[]
}

const BRAND_ORDER = ['Brand A', 'Brand B', 'Brand C']
const fmt = (n: number) => n.toLocaleString()

export function O2OStockClient({
  shops, pivot, shopsByBrand,
}: {
  shops: Shop[]
  pivot: Pivot[]
  shopsByBrand: Record<string, { shop_code: string; shop_name: string }[]>
}) {
  const [view, setView] = useState<'shop' | 'pivot'>('shop')
  const [brand, setBrand] = useState<string>('All')
  const [search, setSearch] = useState('')
  const [openShop, setOpenShop] = useState<Shop | null>(null)

  const brands = useMemo(() => {
    const set = new Set<string>()
    for (const s of shops) if (s.brand) set.add(s.brand)
    const ordered = BRAND_ORDER.filter(b => set.has(b))
    const extras = Array.from(set).filter(b => !BRAND_ORDER.includes(b)).sort()
    return ['All', ...ordered, ...extras]
  }, [shops])

  const filteredShops = useMemo(() => {
    const q = search.toLowerCase().trim()
    return shops.filter(s => {
      if (brand !== 'All' && s.brand !== brand) return false
      if (q) {
        if (s.shop_code.toLowerCase().includes(q) || s.shop_name.toLowerCase().includes(q)) return true
        // also match if any SKU inside matches
        if (s.skus.some(x => x.sku.toLowerCase().includes(q) || (x.product_name || '').toLowerCase().includes(q))) return true
        return false
      }
      return true
    })
  }, [shops, brand, search])

  const filteredPivot = useMemo(() => {
    const q = search.toLowerCase().trim()
    return pivot.filter(p => {
      if (brand !== 'All' && p.brand !== brand) return false
      if (q && !p.sku.toLowerCase().includes(q) && !(p.product_name || '').toLowerCase().includes(q)) return false
      return true
    })
  }, [pivot, brand, search])

  return (
    <>
      {/* Top bar: view toggle + brand + search */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex border border-[#D4D0C7] rounded overflow-hidden">
          <button
            onClick={() => setView('shop')}
            className={`px-3 py-1.5 text-[12px] font-mono ${view === 'shop' ? 'bg-[#1A1A1A] text-white' : 'bg-white text-[#3D3D3D] hover:bg-[#FAFAF7]'}`}
          >By Shop</button>
          <button
            onClick={() => setView('pivot')}
            className={`px-3 py-1.5 text-[12px] font-mono border-l border-[#D4D0C7] ${view === 'pivot' ? 'bg-[#1A1A1A] text-white' : 'bg-white text-[#3D3D3D] hover:bg-[#FAFAF7]'}`}
          >By SKU (Pivot)</button>
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={view === 'shop' ? 'Search shop / SKU…' : 'Search SKU / product…'}
          className="flex-1 max-w-[400px] bg-white border border-[#D4D0C7] rounded px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#C8432C]"
        />
        {search && <button onClick={() => setSearch('')} className="text-[11px] font-mono text-[#6B6B6B]">Clear</button>}
        <span className="ml-auto text-[11px] font-mono text-[#6B6B6B]">
          {view === 'shop'
            ? `${filteredShops.length} of ${shops.length} shops`
            : `${filteredPivot.length} of ${pivot.length} SKUs`}
        </span>
      </div>

      <div className="mb-4 flex gap-2 flex-wrap items-center">
        <span className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] min-w-[60px] font-semibold">Brand</span>
        {brands.map(b => {
          const count = b === 'All'
            ? (view === 'shop' ? shops.length : pivot.length)
            : (view === 'shop' ? shops.filter(s => s.brand === b).length : pivot.filter(p => p.brand === b).length)
          const active = brand === b
          return (
            <button
              key={b}
              onClick={() => setBrand(b)}
              className={`px-3 py-1 rounded-full text-[11px] font-mono border ${
                active ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white border-[#D4D0C7] hover:border-[#1A1A1A]'
              }`}
            >{b} ({count})</button>
          )
        })}
      </div>

      {view === 'shop' && (
        <ShopTableView shops={filteredShops} onOpenShop={setOpenShop} />
      )}
      {view === 'pivot' && (
        <PivotTableView pivot={filteredPivot} shopsByBrand={shopsByBrand} brandFilter={brand} />
      )}

      {openShop && <ShopDetailModal shop={openShop} onClose={() => setOpenShop(null)} />}
    </>
  )
}

// ── By Shop view ─────────────────────────────────────────────────────
function ShopTableView({ shops, onOpenShop }: { shops: Shop[]; onOpenShop: (s: Shop) => void }) {
  return (
    <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
              <th className="px-5 py-3">Brand</th>
              <th className="pl-5 pr-2 py-3">Shop Code</th>
              <th className="pl-2 pr-5 py-3">Shop Name</th>
              <th className="px-5 py-3 text-right">SKUs in Stock</th>
              <th className="px-5 py-3 text-right">Total Units</th>
              <th className="px-5 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {shops.length === 0 && (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-[#6B6B6B]">No shops match the current filters.</td></tr>
            )}
            {shops.map((s, i) => (
              <tr
                key={`${s.brand}::${s.shop_code}::${i}`}
                onClick={() => onOpenShop(s)}
                className="border-b border-[#F0EDE4] last:border-0 hover:bg-[#FAFAF7] cursor-pointer"
              >
                <td className="px-5 py-3"><span className="inline-block px-2 py-0.5 rounded text-[10px] bg-[#E8E5DE] text-[#3D3D3D]">{s.brand}</span></td>
                <td className="pl-5 pr-2 py-3 font-mono text-[11px] text-[#C8432C] whitespace-nowrap">{s.shop_code || '—'}</td>
                <td className="pl-2 pr-5 py-3 font-medium">{s.shop_name || '—'}</td>
                <td className="px-5 py-3 font-mono text-right">{s.skus.length}</td>
                <td className="px-5 py-3 font-mono text-right font-semibold">{fmt(s.total_qty)}</td>
                <td className="px-5 py-3 text-right">
                  <button className="text-[11px] font-mono text-[#C8432C] hover:underline">View SKUs ›</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── By SKU (Pivot) view ─────────────────────────────────────────────
function PivotTableView({
  pivot, shopsByBrand, brandFilter,
}: {
  pivot: Pivot[]
  shopsByBrand: Record<string, { shop_code: string; shop_name: string }[]>
  brandFilter: string
}) {
  // Build the column set: union of all shops in scope, in the order they
  // appear per brand. We render shop NAMES (or shop codes if no name).
  const shopCols = useMemo(() => {
    const seen = new Set<string>()
    const out: { brand: string; shop_code: string; shop_name: string }[] = []
    const brandKeys = brandFilter === 'All' ? Object.keys(shopsByBrand) : [brandFilter]
    for (const b of brandKeys) {
      for (const sh of (shopsByBrand[b] || [])) {
        const key = `${b}::${sh.shop_code}::${sh.shop_name}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ brand: b, ...sh })
      }
    }
    return out
  }, [shopsByBrand, brandFilter])

  return (
    <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
      <div className="overflow-x-auto">
        <table className="text-[12px]" style={{ minWidth: '100%' }}>
          <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
              <th className="px-3 py-3 sticky left-0 bg-[#FAFAF7] z-10">Brand</th>
              <th className="px-3 py-3 sticky left-[80px] bg-[#FAFAF7] z-10 min-w-[140px]">SKU</th>
              <th className="px-3 py-3 min-w-[180px]">Product</th>
              {shopCols.map((c, i) => (
                <th key={i} className="px-2 py-3 text-right whitespace-nowrap" title={c.shop_code}>
                  {c.shop_name || c.shop_code}
                </th>
              ))}
              <th className="px-3 py-3 text-right sticky right-0 bg-[#FAFAF7] z-10 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {pivot.length === 0 && (
              <tr><td colSpan={4 + shopCols.length} className="px-5 py-12 text-center text-[#6B6B6B]">No SKUs match the current filters.</td></tr>
            )}
            {pivot.map((p, i) => {
              const byKey = new Map<string, number>()
              for (const ps of p.per_shop) {
                byKey.set(`${ps.shop_code}::${ps.shop_name}`, ps.qty)
              }
              return (
                <tr key={`${p.brand}::${p.sku}::${i}`} className="border-b border-[#F0EDE4] last:border-0 hover:bg-[#FAFAF7]">
                  <td className="px-3 py-2.5 sticky left-0 bg-white z-10"><span className="inline-block px-2 py-0.5 rounded text-[10px] bg-[#E8E5DE] text-[#3D3D3D]">{p.brand}</span></td>
                  <td className="px-3 py-2.5 sticky left-[80px] bg-white z-10 font-mono text-[11px] text-[#C8432C]">{p.sku}</td>
                  <td className="px-3 py-2.5 text-[12px]">{p.product_name || '—'}</td>
                  {shopCols.map((c, j) => {
                    const k = `${c.shop_code}::${c.shop_name}`
                    const q = byKey.get(k)
                    // Only show value for cells in this row's brand; others blank
                    if (c.brand !== p.brand) return <td key={j} className="px-2 py-2.5 text-right font-mono text-[#D4D0C7]">·</td>
                    return (
                      <td key={j} className={`px-2 py-2.5 text-right font-mono ${q == null || q === 0 ? 'text-[#D4D0C7]' : ''}`}>
                        {q == null || q === 0 ? '—' : fmt(q)}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2.5 text-right font-mono font-semibold sticky right-0 bg-white z-10">{fmt(p.total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Shop detail modal ───────────────────────────────────────────────
function ShopDetailModal({ shop, onClose }: { shop: Shop; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg shadow-2xl w-full max-w-[720px] max-h-[calc(100vh-48px)] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-[#D4D0C7] flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1">
              {shop.brand} · {shop.shop_code}
            </div>
            <h2 className="text-[20px] font-medium">{shop.shop_name || shop.shop_code}</h2>
            <div className="text-[12px] text-[#6B6B6B] mt-1">{shop.skus.length} SKU{shop.skus.length === 1 ? '' : 's'} · {fmt(shop.total_qty)} units</div>
          </div>
          <button onClick={onClose} className="text-[24px] text-[#6B6B6B] leading-none px-2">×</button>
        </div>
        <div className="overflow-y-auto flex-1">
          {shop.skus.length === 0 ? (
            <div className="px-6 py-12 text-center text-[#6B6B6B]">No stock at this shop.</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7] sticky top-0">
                <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
                  <th className="px-5 py-2.5">SKU</th>
                  <th className="px-5 py-2.5">Product</th>
                  <th className="px-5 py-2.5 text-right">Qty</th>
                </tr>
              </thead>
              <tbody>
                {[...shop.skus].sort((a, b) => b.qty - a.qty).map((row, i) => (
                  <tr key={i} className="border-b border-[#F0EDE4] last:border-0">
                    <td className="px-5 py-2.5 font-mono text-[11px] font-medium">{row.sku}</td>
                    <td className="px-5 py-2.5 text-[12px]">{row.product_name || '—'}</td>
                    <td className="px-5 py-2.5 text-right font-mono font-semibold">{fmt(row.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
