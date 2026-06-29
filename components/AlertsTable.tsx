'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Alert = {
  key: string
  type: 'low_stock' | 'expiry' | 'overdue' | 'packaging'
  subject: string
  sku?: string
  details: string
  details_sensitive?: string
  // Structured fields — populated for low_stock alerts so the table can
  // render them as their own columns. Other alert types still use `details`.
  tier?: 'critical' | 'watch'
  on_hand?: number
  months_left?: number | null   // null = unknown / no velocity data
  avg_per_month?: number | null // null = no movement history
  brand?: string                 // for the per-brand chip filter
  suggested_action: string
  delivered: string
  status: 'new' | 'acknowledged'
  bucket: 'active' | 'processing'
  po_ref?: string
}

const typeColors: Record<string, string> = {
  low_stock: 'bg-[#F5DEDA] text-[#A53025]',
  expiry: 'bg-[#F5EDD6] text-[#8B6F1B]',
  overdue: 'bg-[#F5EDD6] text-[#8B6F1B]',
  packaging: 'bg-[#DDE7F0] text-[#2C5282]',
}

const typeLabels: Record<string, string> = {
  low_stock: 'Low Stock',
  expiry: 'Expiry',
  overdue: 'PO Overdue',
  packaging: 'Packaging',
}

const statusColors: Record<string, string> = {
  new: 'bg-[#F5DEDA] text-[#A53025]',
  acknowledged: 'bg-[#E8EFE5] text-[#4A6B3D]',
}

// Filter order: most urgent first, 'all' last so the landing view drops users
// straight into the action queue (low stock).
const FILTERS = ['low_stock', 'overdue', 'expiry', 'packaging', 'all'] as const

export function AlertsTable({ activeAlerts, processingAlerts }: { activeAlerts: Alert[]; processingAlerts: Alert[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<'active' | 'processing'>('active')
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('low_stock')
  const [brandFilter, setBrandFilter] = useState<string>('All')
  const [sortKey, setSortKey] = useState<'months_left' | 'avg_per_month' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  function toggleSort(k: 'months_left' | 'avg_per_month') {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }
  function arrow(k: 'months_left' | 'avg_per_month') {
    if (sortKey !== k) return <span style={{ opacity: 0.3, marginLeft: 4 }}>↕</span>
    return <span style={{ marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
  }
  const [showAcked, setShowAcked] = useState(false)

  const rawList = tab === 'active' ? activeAlerts : processingAlerts
  const ackedCount = useMemo(() => rawList.filter(a => a.status === 'acknowledged').length, [rawList])
  // Hide acknowledged unless user toggled — keeps the list focused on what
  // still needs action; acknowledged ones stay for audit trail.
  const list = showAcked ? rawList : rawList.filter(a => a.status !== 'acknowledged')

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: list.length }
    for (const a of list) c[a.type] = (c[a.type] || 0) + 1
    return c
  }, [list])

  const byType = filter === 'all' ? list : list.filter(a => a.type === filter)
  const filtered = brandFilter === 'All' ? byType : byType.filter(a => a.brand === brandFilter)

  // Brand chips derived from the type-filtered set so the counts reflect
  // the currently-selected alert type tab.
  const presentBrands = useMemo(() => {
    const set = new Set<string>()
    for (const a of byType) if (a.brand) set.add(a.brand)
    const order = ['Nattome', 'NattomeSG', 'Heartio', 'HeartioSG', 'TPD', 'HJT', 'HooHoo', 'Stonecare']
    const sorted = order.filter(b => set.has(b))
    const extras = Array.from(set).filter(b => !order.includes(b)).sort()
    return [...sorted, ...extras]
  }, [byType])
  const brandCount = (b: string) => b === 'All'
    ? byType.length
    : byType.filter(a => a.brand === b).length
  const visible = useMemo(() => {
    if (sortKey) {
      // Treat null / undefined / 'no data' as worst (push to bottom of asc).
      const score = (v: number | null | undefined) => v == null ? Number.POSITIVE_INFINITY : v
      const arr = [...filtered].sort((a, b) => {
        const av = score(a[sortKey])
        const bv = score(b[sortKey])
        return sortDir === 'asc' ? av - bv : bv - av
      })
      return arr
    }
    // Default urgency order — runs when user hasn't picked an explicit sort.
    // 1) acknowledged sink to bottom
    // 2) within new: critical above watch above (no tier)
    // 3) within tier: lowest months_left first, then lowest on_hand
    const statusOrder = (s: string) => s === 'acknowledged' ? 1 : 0
    const tierOrder = (t: string | undefined) => t === 'critical' ? 0 : t === 'watch' ? 1 : 2
    const num = (v: number | null | undefined) => v == null ? Number.POSITIVE_INFINITY : v
    return [...filtered].sort((a, b) => {
      const sa = statusOrder(a.status), sb = statusOrder(b.status)
      if (sa !== sb) return sa - sb
      const ta = tierOrder(a.tier), tb = tierOrder(b.tier)
      if (ta !== tb) return ta - tb
      const ma = num(a.months_left), mb = num(b.months_left)
      if (ma !== mb) return ma - mb
      return num(a.on_hand) - num(b.on_hand)
    })
  }, [filtered, sortKey, sortDir])

  // Where Take Action should jump per alert type
  function actionHref(a: Alert): string | null {
    if (a.type === 'low_stock' && a.sku) return `/purchase-decisions?sku=${encodeURIComponent(a.sku)}`
    if (a.type === 'overdue') return `/purchase-orders`
    if (a.type === 'expiry' && a.sku) return `/products/${encodeURIComponent(a.sku)}`
    if (a.type === 'packaging') return `/packaging`
    return null
  }
  function actionLabel(a: Alert): string {
    if (a.type === 'low_stock') return 'Draft PO'
    if (a.type === 'overdue') return 'Open PO'
    if (a.type === 'expiry') return 'View SKU'
    if (a.type === 'packaging') return 'Open Packaging'
    return 'Take Action'
  }

  async function acknowledge(key: string) {
    const res = await fetch('/api/alerts/acknowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_key: key, actor: 'Grace / Yong Sheng' }),
    })
    if (res.ok) router.refresh()
    else alert((await res.json()).error)
  }

  return (
    <>
      {/* SKUs with a PO drafted/approved are no longer alerts — they've moved
          to the PO workflow. So we only show 'Active' here, no tab switcher. */}

      {/* Type filter */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-mono ${
              filter === f ? 'bg-[#1A1A1A] text-white' : 'border border-[#D4D0C7] hover:bg-[#FAFAF7]'
            }`}
          >
            {f === 'all' ? 'All' : typeLabels[f]} ({counts[f] || 0})
          </button>
        ))}
        {ackedCount > 0 && (
          <button
            onClick={() => setShowAcked(s => !s)}
            className="ml-auto px-3 py-1.5 rounded-full text-[11px] font-mono border border-[#D4D0C7] hover:bg-[#FAFAF7] text-[#6B6B6B]"
            title="Toggle acknowledged alerts visibility"
          >
            {showAcked ? `Hide acknowledged (${ackedCount})` : `Show acknowledged (${ackedCount})`}
          </button>
        )}
      </div>

      {/* Brand filter */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
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
        <table className="w-full text-[13px]">
          <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
              <th className="px-3 py-2.5">Type</th>
              <th className="px-3 py-2.5">SKU</th>
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5">Tier</th>
              <th className="px-3 py-2.5 text-right">On Hand</th>
              <th className="px-3 py-2.5 text-right cursor-pointer select-none hover:text-[#1A1A1A]" onClick={() => toggleSort('months_left')}>
                Months Left{arrow('months_left')}
              </th>
              <th className="px-3 py-2.5 text-right cursor-pointer select-none hover:text-[#1A1A1A]" onClick={() => toggleSort('avg_per_month')}>
                Avg/mo{arrow('avg_per_month')}
              </th>
              <th className="px-3 py-2.5">Suggested Action</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-[#6B6B6B]">
                  {tab === 'active' ? 'No active alerts — everything looks healthy 🎉' : 'No alerts being processed'}
                </td>
              </tr>
            )}
            {visible.map(a => (
              <tr key={a.key} className="border-b border-[#F0EDE4] hover:bg-[#FAFAF7]">
                <td className="px-3 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${typeColors[a.type]}`}>
                    {typeLabels[a.type]}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-[12px] whitespace-nowrap">
                  {a.sku
                    ? <Link href={`/products/${encodeURIComponent(a.sku)}`} className="text-[#C8432C] hover:underline">{a.sku}</Link>
                    : <span className="text-[#6B6B6B]">—</span>}
                </td>
                <td className="px-3 py-2.5 font-medium">
                  {a.sku
                    ? <Link href={`/products/${encodeURIComponent(a.sku)}`} className="hover:underline">{a.subject}</Link>
                    : a.subject}
                </td>
                {a.type === 'low_stock' ? (
                  <>
                    <td className="px-3 py-2.5">
                      {a.tier === 'critical' ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-[#F5DEDA] text-[#A53025]">🔴 Critical</span>
                      ) : a.tier === 'watch' ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-[#F5EDD6] text-[#8B6F1B]">🟡 Watch</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">
                      {a.on_hand != null ? a.on_hand.toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[12px]">
                      {a.months_left == null ? <span className="text-[#6B6B6B]">no data</span>
                        : a.months_left >= 999 ? '∞'
                        : a.months_left.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-[12px]">
                      <span className="sensitive">
                        {a.avg_per_month == null || a.avg_per_month === 0 ? '—' : Math.round(a.avg_per_month).toLocaleString()}
                      </span>
                    </td>
                  </>
                ) : (
                  // Non-low-stock alert types keep their original combined details string
                  <td colSpan={4} className="px-3 py-2.5 text-[#6B6B6B]">
                    {a.details}
                    {a.details_sensitive && <> · <span className="sensitive">{a.details_sensitive}</span></>}
                  </td>
                )}
                <td className="px-3 py-2.5">
                  {a.po_ref ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="font-mono text-[11px] text-[#C8432C]">{a.po_ref}</span>
                      <span className="text-[#6B6B6B]">·</span>
                      <span>{a.suggested_action}</span>
                    </span>
                  ) : a.suggested_action}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${statusColors[a.status]}`}>
                    {a.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  {actionHref(a) && (
                    <Link
                      href={actionHref(a)!}
                      className="inline-block px-2.5 py-1 bg-[#C8432C] text-white rounded text-[11px] hover:bg-[#A53025] mr-1.5"
                    >
                      {actionLabel(a)}
                    </Link>
                  )}
                  {a.status !== 'acknowledged' && (
                    <button
                      onClick={() => acknowledge(a.key)}
                      className="px-2.5 py-1 border border-[#D4D0C7] rounded text-[11px] text-[#6B6B6B] hover:bg-[#FAFAF7]"
                    >
                      ✓ Ack
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-1 pb-2 text-[14px] border-b-2 transition-colors ${
        active ? 'border-[#C8432C] text-[#1A1A1A] font-medium' : 'border-transparent text-[#6B6B6B] hover:text-[#1A1A1A]'
      }`}
    >
      {children}
    </button>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: 'red' | 'amber' }) {
  const cls = color === 'red' ? 'bg-[#F5DEDA] text-[#A53025]' : 'bg-[#F5EDD6] text-[#8B6F1B]'
  return <span className={`ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-mono ${cls}`}>{children}</span>
}
