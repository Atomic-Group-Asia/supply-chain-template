'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { MultiDraftPOModal } from './MultiDraftPOModal'

type Row = {
  sku: string
  brand: string
  product_name: string
  closing?: number
  incoming?: number
  committed?: number
  available: number
  safety: number
  moq: number
  lead_days: number
  lm_avg: number
  l3m_avg: number
  l6m_avg: number
  stock_months: number
  suggest_qty: number | null
  status: 'draft' | 'review' | 'healthy'
  unit_cost: number
  supplier_code: string | null
  active_po?: string | null
}

type Supplier = { supplier_code: string; supplier_name: string }
type Entity = { code: string; legal_name: string; brands: string[] }
type BomItem = {
  code: string
  name: string
  qty_per_unit: number
  type: string | null
  supplier_code: string | null
  unit_cost: number
  pack_size: number
}

export function PurchaseDecisionsTable({
  rows,
  suppliers,
  entities,
  bomBySku,
}: {
  rows: Row[]
  suppliers: Supplier[]
  entities: Entity[]
  bomBySku: Record<string, BomItem[]>
}) {
  const [filter, setFilter] = useState<'needs' | 'all' | 'in_progress' | string>('needs')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [draftRows, setDraftRows] = useState<Row[] | null>(null)
  const searchParams = useSearchParams()

  // Deep-link from Alerts: /purchase-decisions?sku=N-DH-OAT-15s
  // Switch to All filter (so the SKU is in view regardless of status),
  // pre-select its checkbox, and scroll to the row.
  useEffect(() => {
    const sku = searchParams?.get('sku')
    if (!sku) return
    const match = rows.find(r => r.sku === sku)
    if (!match) return
    setFilter('all')
    setSelected(new Set([`${match.brand}::${match.sku}`]))
    // Defer scroll to next tick so the table has re-rendered with filter='all'
    setTimeout(() => {
      const el = document.getElementById(`pd-row-${match.brand}-${match.sku}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const brands = useMemo(() => Array.from(new Set(rows.map(r => r.brand))).sort(), [rows])
  // Needs Action = stock-mo critical/review AND no active PO yet
  const needsAction = useMemo(() => rows.filter(r => r.status !== 'healthy' && !r.active_po), [rows])
  // In Progress = has an active PO (pending/approved), regardless of stock-mo
  const inProgress = useMemo(() => rows.filter(r => !!r.active_po), [rows])

  const visible = useMemo(() => {
    if (filter === 'needs') return needsAction
    if (filter === 'in_progress') return inProgress
    if (filter === 'all') return rows
    return rows.filter(r => r.brand === filter)
  }, [filter, rows, needsAction, inProgress])

  const key = (r: Row) => `${r.brand}::${r.sku}`

  function toggle(r: Row) {
    setSelected(prev => {
      const k = key(r)
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === visible.length) setSelected(new Set())
    else setSelected(new Set(visible.map(key)))
  }

  function openMulti() {
    const list = rows.filter(r => selected.has(key(r)))
    if (list.length === 0) return
    setDraftRows(list)
  }

  function openSingle(r: Row) {
    setDraftRows([r])
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">
          <Tab active={filter === 'needs'} onClick={() => setFilter('needs')}>
            Needs Action ({needsAction.length})
          </Tab>
          <Tab active={filter === 'in_progress'} onClick={() => setFilter('in_progress')}>
            🛒 In Progress ({inProgress.length})
          </Tab>
          <Tab active={filter === 'all'} onClick={() => setFilter('all')}>
            All SKUs ({rows.length})
          </Tab>
          {brands.map(b => (
            <Tab key={b} active={filter === b} onClick={() => setFilter(b)}>
              {b}
            </Tab>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="text-[11px] font-mono uppercase tracking-wider text-[#6B6B6B]">
            {selected.size > 0 ? `${selected.size} selected` : 'Sort: Stock-months ascending'}
          </div>
          <button
            onClick={openMulti}
            disabled={selected.size === 0}
            className="px-3 py-1.5 bg-[#1A1A1A] text-white rounded text-[12px] hover:bg-black disabled:opacity-40"
          >
            Draft POs ({selected.size})
          </button>
        </div>
      </div>

      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
              <th className="px-3 py-2.5 w-8">
                <input
                  type="checkbox"
                  checked={visible.length > 0 && selected.size === visible.length}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-3 py-2.5">SKU</th>
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5">Brand</th>
              <th className="px-3 py-2.5 text-right" title="closing + incoming − committed">Available</th>
              <th className="px-3 py-2.5 text-right" title="Months of cover at current sales rate">Stock-Mo</th>
              <th className="px-3 py-2.5 text-right" title="Suggested order qty (rounded up to MOQ)">Suggest</th>
              <th className="px-3 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-[#6B6B6B]">
                  No SKUs match this filter
                </td>
              </tr>
            )}
            {visible.map(r => {
              const k = key(r)
              const lowStock = r.stock_months < 2.5
              const watchStock = r.stock_months >= 2.5 && r.stock_months < 3.5
              return (
                <tr key={k} id={`pd-row-${r.brand}-${r.sku}`} className={`border-b border-[#F0EDE4] hover:bg-[#FAFAF7] ${selected.has(k) ? 'bg-[#FAFAF7]' : ''}`}>
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(k)}
                      onChange={() => toggle(r)}
                      disabled={!!r.active_po}
                      title={r.active_po ? `Already in PO ${r.active_po}` : ''}
                    />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[12px]">
                    <Link href={`/products/${encodeURIComponent(r.sku)}`} className="text-[#C8432C] hover:underline">{r.sku}</Link>
                  </td>
                  <td className="px-3 py-2.5">{r.product_name}</td>
                  <td className="px-3 py-2.5 text-[12px]">{r.brand}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold">
                    {r.available.toLocaleString()}
                    {(r.incoming ?? 0) > 0 && (
                      <span className="block text-[10px] text-[#4A6B3D]">+{r.incoming!.toLocaleString()} incoming</span>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-mono font-semibold ${lowStock ? 'text-[#C8432C]' : watchStock ? 'text-[#B8860B]' : ''}`}>
                    {r.stock_months >= 999 ? '∞' : r.stock_months.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {r.suggest_qty != null ? r.suggest_qty.toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {r.active_po ? (
                      <a
                        href={`/purchase-orders`}
                        className="inline-block px-2.5 py-1 bg-[#FFF5F1] border border-[#C8432C] text-[#C8432C] rounded text-[11px] font-mono hover:bg-[#C8432C] hover:text-white"
                        title={`PO ${r.active_po} drafted — click to view`}
                      >
                        🛒 {r.active_po}
                      </a>
                    ) : r.status === 'draft' ? (
                      <button
                        onClick={() => openSingle(r)}
                        className="px-3 py-1.5 bg-[#1A1A1A] text-white rounded text-[12px] hover:bg-[#000]"
                      >
                        Draft PO
                      </button>
                    ) : r.status === 'review' ? (
                      <button
                        onClick={() => openSingle(r)}
                        className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[12px] hover:bg-[#FAFAF7]"
                      >
                        Review
                      </button>
                    ) : (
                      <span className="inline-block px-2 py-1 bg-[#E8EFE5] text-[#4A6B3D] rounded text-[10px] font-mono uppercase tracking-wider">
                        Healthy
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {draftRows && (
        <MultiDraftPOModal
          rows={draftRows}
          suppliers={suppliers}
          entities={entities}
          bomBySku={bomBySku}
          onClose={() => {
            setDraftRows(null)
            setSelected(new Set())
          }}
        />
      )}
    </>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-[12px] font-mono transition-colors ${
        active ? 'bg-[#1A1A1A] text-white' : 'border border-[#D4D0C7] text-[#1A1A1A] hover:bg-[#FAFAF7]'
      }`}
    >
      {children}
    </button>
  )
}
