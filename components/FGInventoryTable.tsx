'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type Item = {
  sku: string
  product_name: string
  brand: string
  category: string
  closing_stock: number | null
  incoming?: number
  committed?: number
  available?: number
  earliest_expiry?: string | null
  incoming_eta?: string | null
  batch_count?: number
  min_level: number | null
  restock_level: number | null
  avg_monthly_sales: number | null
  days_coverage: number | null
  coverage_status: string
  restock_alert: string
  notes: string
}

type SortKey = 'sku' | 'product_name' | 'closing_stock' | 'restock_alert' | 'earliest_expiry' | 'incoming' | 'incoming_eta' | null
type SortDir = 'asc' | 'desc'

// Group MY + SG pairs together; HJT is new, slot before HooHoo/Stonecare
const BRAND_ORDER = ['Nattome', 'NattomeSG', 'Heartio', 'HeartioSG', 'TPD', 'HJT', 'HooHoo', 'Stonecare']
const CATEGORY_ORDER = ['Product', 'Merchandise', 'Free Gift', 'Inactive', 'Others']

function sortByOrder(values: string[], order: string[]): string[] {
  const present = new Set(values)
  const ordered = order.filter(v => present.has(v))
  const extras = values.filter(v => !order.includes(v)).sort()
  return [...ordered, ...extras]
}

function getStatusStyle(status: string) {
  const s = status.toUpperCase()
  if (s.includes('CRITICAL')) return 'bg-[#F5DEDA] text-[#A53025]'
  if (s.includes('RESTOCK') || s.includes('ALERT')) return 'bg-[#F5EDD6] text-[#B8860B]'
  if (s.includes('OK') || s.includes('HEALTHY')) return 'bg-[#E4EDE0] text-[#4A6B3D]'
  return 'bg-[#E8E5DE] text-[#6B6B6B]'
}

function getDaysCoverageStyle(days: number | null): React.CSSProperties {
  if (days == null) return {}
  if (days < 30) return { color: '#A53025', fontWeight: 600 }
  if (days < 60) return { color: '#B8860B' }
  return {}
}

/** Color the earliest-expiry column by months remaining. Matches the
 *  same tier scheme used on the batch detail page (Phase 1):
 *    < 0 days  → expired (grey/red)
 *    < 90      → critical (red)
 *    < 180     → 6mo watch (orange)
 *    < 365     → 12mo watch (amber)
 *    else      → fresh (green)
 */
function getExpiryStyle(expiry: string | null | undefined): React.CSSProperties {
  if (!expiry) return {}
  const d = new Date(expiry)
  if (isNaN(d.getTime())) return {}
  const days = Math.floor((d.getTime() - Date.now()) / 86400000)
  if (days < 0) return { color: '#A53025', fontWeight: 700, textDecoration: 'line-through' }
  if (days < 90) return { color: '#A53025', fontWeight: 600 }
  if (days < 180) return { color: '#8B4F0B', fontWeight: 600 }
  if (days < 365) return { color: '#B8860B' }
  return { color: '#4A6B3D' }
}

/** YYYY-MM-DD → DD/MM/YYYY (UK-style display preferred by ops). */
function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function expiryDisplay(expiry: string): string {
  const d = new Date(expiry)
  if (isNaN(d.getTime())) return expiry
  const days = Math.floor((d.getTime() - Date.now()) / 86400000)
  const months = Math.round(days / 30)
  const human = fmtDate(expiry)
  if (days < 0) return `${human} · EXPIRED`
  if (days < 90) return `${human} · ${days}d`
  return `${human} · ~${months}mo`
}

const fmt = (n: number | null) => n == null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 0 })

const thBaseStyle: React.CSSProperties = {
  padding: '12px 16px',
  textAlign: 'left',
  fontFamily: 'var(--font-jetbrains-mono), monospace',
  fontSize: '9px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#6B6B6B',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

export function FGInventoryTable({
  items,
  products = [],
  bom = [],
  suppliers = [],
  packaging = [],
}: {
  items: Item[]
  products?: any[]
  bom?: any[]
  suppliers?: any[]
  packaging?: any[]
}) {
  const searchParams = useSearchParams()
  const initialBrand = searchParams?.get('brand') || 'All'
  const [filterBrand, setFilterBrand] = useState(initialBrand)
  const [filterCategory, setFilterCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [refreshing, setRefreshing] = useState(false)
  const [missingMsg, setMissingMsg] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(10)
  const router = useRouter()

  const productsBySku = useMemo(() => {
    const map: Record<string, any> = {}
    for (const p of products) map[p.sku] = p
    return map
  }, [products])

  const brands = useMemo(() => {
    const present = Array.from(new Set(items.map(i => i.brand).filter(Boolean)))
    return ['All', ...sortByOrder(present, BRAND_ORDER)]
  }, [items])

  const categories = useMemo(() => {
    const present = Array.from(new Set(items.map(i => i.category).filter(Boolean)))
    return ['All', ...sortByOrder(present, CATEGORY_ORDER)]
  }, [items])

  const brandCount = (b: string) =>
    b === 'All' ? items.length : items.filter(i => i.brand === b).length

  const categoryCount = (c: string) => {
    const pool = filterBrand === 'All' ? items : items.filter(i => i.brand === filterBrand)
    return c === 'All' ? pool.length : pool.filter(i => i.category === c).length
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return items.filter(i => {
      if (filterBrand !== 'All' && i.brand !== filterBrand) return false
      if (filterCategory !== 'All' && i.category !== filterCategory) return false
      if (q && !i.sku.toLowerCase().includes(q) && !i.product_name.toLowerCase().includes(q)) return false
      return true
    })
  }, [items, filterBrand, filterCategory, search])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const arr = [...filtered]
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
  }, [filtered, sortKey, sortDir])

  function toggleSort(k: Exclude<SortKey, null>) {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
    setPage(1)
  }

  // Reset page on filter/search change
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageEnd = pageStart + pageSize
  const visible = sorted.slice(pageStart, pageEnd)

  function arrow(k: Exclude<SortKey, null>) {
    if (sortKey !== k) return <span style={{ opacity: 0.3, marginLeft: '6px' }}>↕</span>
    return <span style={{ marginLeft: '6px' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  function handleRowClick(sku: string) {
    // Route to FG Inventory detail page (batches view). Doesn't require the
    // SKU to exist in the Products master table — SKU Mapping gsheet is the
    // master list and covers HJT / TPD etc. that don't have full BOM data.
    const item = items.find(i => i.sku === sku)
    const brand = item?.brand || ''
    router.push(`/fg-inventory/${encodeURIComponent(brand)}/${encodeURIComponent(sku)}`)
  }

  async function refresh() {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 800)
  }

  // Suppress unused-prop warnings — these will be passed but used by detail page
  void bom; void suppliers; void packaging

  return (
    <>
      <div style={{ marginBottom: '24px', backgroundColor: 'white', border: '1px solid #D4D0C7', borderRadius: '6px', padding: '20px 24px' }}>
        {/* Search row */}
        <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B6B6B', minWidth: '60px', fontWeight: 600 }}>
            Search
          </span>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Type SKU or product name..."
            style={{ flex: '1 1 200px', minWidth: '160px', maxWidth: '500px', padding: '7px 12px', border: '1px solid #D4D0C7', borderRadius: '4px', fontSize: '13px', backgroundColor: 'white', outline: 'none', fontFamily: 'inherit' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ padding: '6px 10px', fontSize: '11px', fontFamily: 'var(--font-jetbrains-mono), monospace', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer' }}>
              Clear
            </button>
          )}
          <button
            onClick={refresh}
            disabled={refreshing}
            style={{ marginLeft: 'auto', padding: '7px 12px', borderRadius: '4px', fontSize: '12px', fontFamily: 'var(--font-jetbrains-mono), monospace', border: '1px solid #D4D0C7', backgroundColor: 'white', color: '#3D3D3D', cursor: refreshing ? 'wait' : 'pointer', opacity: refreshing ? 0.5 : 1, whiteSpace: 'nowrap' }}
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>

        {/* Brand filter row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B6B6B', minWidth: '60px', fontWeight: 600 }}>
            Brand
          </span>
          {brands.map(b => {
            const count = brandCount(b)
            const active = filterBrand === b
            return (
              <button
                key={b}
                onClick={() => { setFilterBrand(b); setPage(1) }}
                style={{
                  padding: '5px 10px', borderRadius: '999px', fontSize: '12px',
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  border: `1px solid ${active ? '#1A1A1A' : '#D4D0C7'}`,
                  backgroundColor: active ? '#1A1A1A' : 'white',
                  color: active ? '#FAFAF7' : '#3D3D3D',
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s ease',
                }}
              >
                {b} <span style={{ opacity: 0.6 }}>({count})</span>
              </button>
            )
          })}
        </div>

        {/* Category filter row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6B6B6B', minWidth: '60px', fontWeight: 600 }}>
            Category
          </span>
          {categories.map(c => {
            const count = categoryCount(c)
            const active = filterCategory === c
            const dimmed = count === 0
            return (
              <button
                key={c}
                onClick={() => { setFilterCategory(c); setPage(1) }}
                disabled={dimmed && c !== 'All'}
                style={{
                  padding: '5px 10px', borderRadius: '999px', fontSize: '12px',
                  fontFamily: 'var(--font-jetbrains-mono), monospace',
                  border: `1px solid ${active ? '#C8432C' : '#D4D0C7'}`,
                  backgroundColor: active ? '#C8432C' : 'white',
                  color: active ? '#FAFAF7' : '#3D3D3D',
                  cursor: dimmed && c !== 'All' ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap', transition: 'all 0.15s ease',
                  opacity: dimmed && c !== 'All' ? 0.4 : 1,
                }}
              >
                {c} <span style={{ opacity: 0.6 }}>({count})</span>
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '11px', color: '#6B6B6B', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span>
            Showing {sorted.length === 0 ? 0 : pageStart + 1}–{Math.min(pageEnd, sorted.length)} of {sorted.length} ({items.length} total)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            Per page:
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
              style={{ padding: '3px 6px', border: '1px solid #D4D0C7', borderRadius: '4px', fontFamily: 'inherit', fontSize: '11px', background: 'white', cursor: 'pointer' }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </span>
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '11px' }}>
            <button
              onClick={() => setPage(safePage - 1)}
              disabled={safePage === 1}
              style={{ padding: '4px 10px', border: '1px solid #D4D0C7', borderRadius: '4px', backgroundColor: 'white', cursor: safePage === 1 ? 'not-allowed' : 'pointer', opacity: safePage === 1 ? 0.4 : 1 }}
            >
              ← Prev
            </button>
            <span style={{ padding: '0 6px', color: '#6B6B6B' }}>
              <strong style={{ color: '#1A1A1A' }}>{safePage}</strong> / {totalPages}
            </span>
            <button
              onClick={() => setPage(safePage + 1)}
              disabled={safePage === totalPages}
              style={{ padding: '4px 10px', border: '1px solid #D4D0C7', borderRadius: '4px', backgroundColor: 'white', cursor: safePage === totalPages ? 'not-allowed' : 'pointer', opacity: safePage === totalPages ? 0.4 : 1 }}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      <div style={{ backgroundColor: 'white', border: '1px solid #D4D0C7', borderRadius: '6px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
            <thead style={{ backgroundColor: '#FAFAF7', borderBottom: '1px solid #D4D0C7' }}>
              <tr>
                <th style={thBaseStyle}>Brand</th>
                <th style={thBaseStyle}>Category</th>
                <th style={{ ...thBaseStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('sku')}>
                  SKU{arrow('sku')}
                </th>
                <th style={{ ...thBaseStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('product_name')}>
                  Product{arrow('product_name')}
                </th>
                <th style={{ ...thBaseStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('closing_stock')} title="From daily Excel/CSV upload (Closing Balance column)">
                  Available{arrow('closing_stock')}
                </th>
                <th style={{ ...thBaseStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('earliest_expiry')} title="Earliest expiry across active batches (FEFO) — click to sort">
                  Earliest Expiry{arrow('earliest_expiry')}
                </th>
                <th style={{ ...thBaseStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('incoming')} title="On approved / partial_received FG POs">
                  Incoming{arrow('incoming')}
                </th>
                <th style={{ ...thBaseStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort('incoming_eta')} title="Earliest expected_date across active inbound POs">
                  ETA{arrow('incoming_eta')}
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item, idx) => {
                return (
                  <tr
                    key={idx}
                    onClick={() => handleRowClick(item.sku)}
                    style={{ borderBottom: '1px solid #E8E5DE', cursor: 'pointer' }}
                    className="hover:bg-[#FAFAF7] transition-colors"
                  >
                    <td style={{ padding: '10px 16px' }}>
                      {item.brand && <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '3px', fontSize: '10px', backgroundColor: '#E8E5DE', color: '#3D3D3D', fontWeight: 500 }}>{item.brand}</span>}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {item.category && <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '3px', fontSize: '10px', backgroundColor: '#DDE8EF', color: '#2C5F7C' }}>{item.category}</span>}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '11px', fontWeight: 500, whiteSpace: 'nowrap' }}>{item.sku}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 500 }}>{item.product_name || '—'}</td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-jetbrains-mono), monospace', fontWeight: 700, textAlign: 'right' }}>
                      {fmt(item.available ?? item.closing_stock)}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '11px', whiteSpace: 'nowrap', ...getExpiryStyle(item.earliest_expiry) }}>
                      {item.earliest_expiry ? expiryDisplay(item.earliest_expiry) : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-jetbrains-mono), monospace', textAlign: 'right', color: '#4A6B3D' }}>
                      {(item.incoming ?? 0) > 0 ? `+${item.incoming!.toLocaleString()}` : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '11px', whiteSpace: 'nowrap', color: '#6B6B6B' }}>
                      {item.incoming_eta || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '12px' }}>
          <button
            onClick={() => setPage(1)}
            disabled={safePage === 1}
            style={{ padding: '6px 10px', border: '1px solid #D4D0C7', borderRadius: '4px', backgroundColor: 'white', cursor: safePage === 1 ? 'not-allowed' : 'pointer', opacity: safePage === 1 ? 0.4 : 1 }}
          >
            ⟪
          </button>
          <button
            onClick={() => setPage(safePage - 1)}
            disabled={safePage === 1}
            style={{ padding: '6px 12px', border: '1px solid #D4D0C7', borderRadius: '4px', backgroundColor: 'white', cursor: safePage === 1 ? 'not-allowed' : 'pointer', opacity: safePage === 1 ? 0.4 : 1 }}
          >
            ← Prev
          </button>
          <span style={{ padding: '0 12px', color: '#6B6B6B' }}>
            Page <strong style={{ color: '#1A1A1A' }}>{safePage}</strong> of {totalPages}
          </span>
          <button
            onClick={() => setPage(safePage + 1)}
            disabled={safePage === totalPages}
            style={{ padding: '6px 12px', border: '1px solid #D4D0C7', borderRadius: '4px', backgroundColor: 'white', cursor: safePage === totalPages ? 'not-allowed' : 'pointer', opacity: safePage === totalPages ? 0.4 : 1 }}
          >
            Next →
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={safePage === totalPages}
            style={{ padding: '6px 10px', border: '1px solid #D4D0C7', borderRadius: '4px', backgroundColor: 'white', cursor: safePage === totalPages ? 'not-allowed' : 'pointer', opacity: safePage === totalPages ? 0.4 : 1 }}
          >
            ⟫
          </button>
        </div>
      )}

      {missingMsg && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', padding: '12px 20px', backgroundColor: '#1A1A1A', color: '#FAFAF7', borderRadius: '6px', fontSize: '13px', zIndex: 10000, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
          {missingMsg}
        </div>
      )}
    </>
  )
}