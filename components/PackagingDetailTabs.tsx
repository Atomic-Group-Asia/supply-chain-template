'use client'

import { useState } from 'react'
import Link from 'next/link'
import { EditPackagingModal } from './EditPackagingModal'

type Tab = 'overview' | 'pos' | 'consumption'

const fmtN = (n: any) => n == null ? '—' : Number(n).toLocaleString()
const fmtRM = (n: any) => n == null ? '—' : `RM ${Number(n).toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`

type StockInfo = {
  openingStock: number
  openingLabelPrimary: string
  openingLabelSecondary: string
  openingNote: string
  incomingQty: number
  incomingLabelPrimary: string
  incomingLabelSecondary: string
  incomingPoLabel: string
  incomingEta: string | null
  committedQty: number
  committedLabelPrimary: string
  committedLabelSecondary: string
  committedDesc: string
  availableQty: number
  availableLabelPrimary: string
  availableLabelSecondary: string
  moq: number
  packSize: number
  innerUom: string  // inner unit name (from packaging.uom) — used as label everywhere instead of hardcoded 'pcs'
  outerUom: string  // outer pack name (Roll / Pack / Box)
  healthLabel: string
  isHealthy: boolean
}

type VelocityInfo = {
  lm: number
  l3m: number
  l6m: number
  stockMonths: number
  trendLabel: string
  velocityNote: string
  available: number
}

export function PackagingDetailTabs({
  packaging, suppliers, stockInfo, velocityInfo, fgUsers, pos, supplierMap, movements,
}: {
  packaging: any
  suppliers: any[]
  stockInfo: StockInfo
  velocityInfo: VelocityInfo
  fgUsers: any[]
  pos: any[]
  supplierMap: Record<string, string>
  movements?: any[]
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState(false)

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'pos', label: 'POs', count: pos.length },
    { key: 'consumption', label: 'Consumption', count: (movements || []).length },
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px', gap: '8px' }}>
        <button
          onClick={() => setEditing(true)}
          style={{ backgroundColor: 'white', color: '#1A1A1A', padding: '8px 16px', borderRadius: '4px', fontSize: '13px', border: '1px solid #D4D0C7', cursor: 'pointer' }}
        >
          Edit
        </button>
        <button
          disabled
          title="Coming soon — pre-filled Draft Packaging PO"
          style={{ backgroundColor: '#1A1A1A', color: '#FAFAF7', padding: '8px 16px', borderRadius: '4px', fontSize: '13px', border: 'none', cursor: 'not-allowed', opacity: 0.6 }}
        >
          Create PO
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #D4D0C7', marginBottom: '24px' }}>
        {tabs.map(t => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '10px 20px',
                fontSize: '13px',
                marginBottom: '-1px',
                background: 'none',
                border: 'none',
                borderBottom: `2px solid ${active ? '#C8432C' : 'transparent'}`,
                color: active ? '#C8432C' : '#6B6B6B',
                fontWeight: active ? 500 : 400,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
              {t.count != null && t.count > 0 && (
                <span style={{ marginLeft: '8px', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '10px', backgroundColor: active ? '#F5E4E0' : '#E8E5DE', color: active ? '#C8432C' : '#6B6B6B', padding: '2px 6px', borderRadius: '3px' }}>
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'overview' && (
        <OverviewTab packaging={packaging} stockInfo={stockInfo} velocityInfo={velocityInfo} supplierMap={supplierMap} fgUsers={fgUsers} />
      )}
      {/* Used By (FG) tab removed — info now lives as 'Component for [SKUs]'
          line on each PO detail packaging line item. */}
      {tab === 'pos' && <POsTab pos={pos} code={packaging.packaging_code} />}
      {tab === 'consumption' && <ConsumptionTab movements={movements || []} uom={stockInfo.innerUom} />}

      {editing && (
        <EditPackagingModal
          packaging={packaging}
          suppliers={suppliers}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}

// ============================================================================
// OVERVIEW
// ============================================================================
function OverviewTab({ packaging, stockInfo, velocityInfo, supplierMap, fgUsers }: { packaging: any; stockInfo: StockInfo; velocityInfo: VelocityInfo; supplierMap: Record<string, string>; fgUsers: any[] }) {
  const packSize = Number(packaging.pack_size) || 1
  const costPerPc = packSize > 0 ? (Number(packaging.unit_cost) || 0) / packSize : 0
  return (
    <div className="flex flex-col gap-6">
      <StockPositionCard info={stockInfo} />

      <div className="grid grid-cols-[1.4fr_1fr] gap-6">
        <PackagingMasterCard packaging={packaging} supplierMap={supplierMap} usedByCount={fgUsers.length} stockInfo={stockInfo} fgUsers={fgUsers} />
        <UsageVelocityCard info={velocityInfo} />
      </div>

      <UsedByPreviewCard fgUsers={fgUsers.slice(0, 6)} costPerPc={costPerPc} packaging={packaging} />
    </div>
  )
}

function StockPositionCard({ info }: { info: StockInfo }) {
  const incomingSub = info.incomingPoLabel
    ? `${info.incomingPoLabel}${info.incomingEta ? ` · ETA ${info.incomingEta}` : ''}`
    : 'No open packaging POs'
  const uomNote = info.packSize > 1 ? `1 ${info.outerUom} = ${info.packSize.toLocaleString()} ${info.innerUom}` : ''
  // Stock commitments are now RECORD-ONLY (gsheet stock_balance already
  // accounts for any commitments at the warehouse level). Do NOT subtract
  // them from Projected — that would double-count.

  return (
    <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
      <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
        <div className="font-medium text-[15px]">Stock Position</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">
          Real-time{uomNote ? ` · ${uomNote}` : ''}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* LEFT: On Hand — what the warehouse actually has today */}
        <div className="p-6 bg-[#FFF5F1] border-b md:border-b-0 md:border-r border-[#D4D0C7]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-2">
            On Hand · matches Packaging list
          </div>
          <div className="text-[34px] font-medium font-mono leading-none" style={{ color: info.isHealthy ? '#4A6B3D' : '#C8432C' }}>
            {info.openingLabelPrimary}
          </div>
          {info.openingLabelSecondary && (
            <div className="text-[13px] font-mono text-[#6B6B6B] mt-0.5">{info.openingLabelSecondary}</div>
          )}
          <div className="text-[11px] text-[#6B6B6B] mt-2 font-mono">
            {info.openingNote} · {info.healthLabel}
          </div>
          <div className="text-[10px] text-[#6B6B6B] mt-2 leading-relaxed">
            This is what your warehouse currently holds. Incoming POs don't roll in until the receipt is recorded.
          </div>
        </div>

        {/* RIGHT: Projected breakdown */}
        <div className="p-6">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-3">
            Projected after PO + FG commitments
          </div>
          <div className="flex flex-col gap-1.5 font-mono text-[13px]">
            <PkgBreakdownRow label="Opening" primary={info.openingLabelPrimary} secondary={info.openingLabelSecondary} />
            <PkgBreakdownRow label="+ Incoming (Pkg PO)" primary={info.incomingLabelPrimary} secondary={info.incomingLabelSecondary} sub={incomingSub} positive />
            <div className="border-t border-[#E8E5DE] mt-1 pt-2 flex justify-between items-baseline gap-3">
              <span className="text-[11px] uppercase tracking-wider text-[#6B6B6B]">= Projected (Opening + Incoming)</span>
              <div className="text-right">
                <div className="text-[20px] font-medium" style={{ color: '#2C5282' }}>
                  {(info.openingStock + info.incomingQty).toLocaleString()} {info.innerUom}
                </div>
              </div>
            </div>
            <div className="mt-1 pt-2 border-t border-dashed border-[#E8E5DE]">
              <PkgBreakdownRow
                label="Committed (as record)"
                primary={info.committedLabelPrimary}
                secondary={info.committedLabelSecondary}
                sub={info.committedDesc}
                muted
              />
              <div className="text-[10px] text-[#6B6B6B] mt-1 italic">
                Already deducted in gsheet Opening — shown here for visibility only.
              </div>
            </div>
          </div>
          <div className="text-[10px] text-[#6B6B6B] mt-3 leading-relaxed">
            Informational only. On Hand reflects current physical stock.
          </div>
        </div>
      </div>
    </div>
  )
}

function PkgBreakdownRow({ label, primary, secondary, sub, positive, negative, muted }: { label: string; primary: string; secondary?: string; sub?: string; positive?: boolean; negative?: boolean; muted?: boolean }) {
  const color = muted ? '#6B6B6B' : positive ? '#4A6B3D' : negative ? '#C8432C' : '#1A1A1A'
  return (
    <div className="flex justify-between items-baseline gap-3">
      <div className="flex flex-col min-w-0 flex-1">
        <span className={muted ? 'text-[#6B6B6B]' : 'text-[#1A1A1A]'}>{label}</span>
        {sub && <span className="text-[10px] text-[#6B6B6B] truncate">{sub}</span>}
      </div>
      <div className="text-right whitespace-nowrap">
        <span className="font-mono" style={{ color }}>{primary}</span>
        {secondary && <div className="text-[10px] text-[#6B6B6B]">{secondary}</div>}
      </div>
    </div>
  )
}

function PackagingMasterCard({ packaging, supplierMap, usedByCount, stockInfo, fgUsers }: { packaging: any; supplierMap: Record<string, string>; usedByCount: number; stockInfo: StockInfo; fgUsers: any[] }) {
  const supplierName = packaging.supplier_code ? (supplierMap[packaging.supplier_code] || packaging.supplier_code) : '—'
  const packSize = Number(packaging.pack_size) || 1
  const unitCost = Number(packaging.unit_cost) || 0
  const costPerPc = packSize > 0 ? unitCost / packSize : 0
  const isBulk = packSize > 1
  const outerName = /foil/i.test(packaging.packaging_type || '') ? 'Roll' : isBulk ? 'Pack' : 'Unit'

  const innerName = (packaging.uom && String(packaging.uom).trim()) || 'pc'
  const isInnerPc = /^pcs?$/i.test(innerName)
  // Derived "per real pc" cost when the master uom is something like "Unit" /
  // "Set" (i.e. inner-Unit contains multiple raw pcs). pcs-per-inner-Unit
  // is taken from BOM qty_per_unit when the FG consumes a fixed pcs count
  // per FG bottle (e.g. 15 pcs Foil per FG bottle → 1 Unit = 15 pcs).
  function modeQty(): number {
    const counts: Record<string, number> = {}
    for (const u of fgUsers || []) {
      const q = String(Number(u.qty_per_unit) || 0)
      counts[q] = (counts[q] || 0) + 1
    }
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    return top ? Number(top[0]) : 0
  }
  const pcsPerInnerUnit = isInnerPc ? 1 : modeQty()
  const perPc = pcsPerInnerUnit > 1 ? costPerPc / pcsPerInnerUnit : null
  const unitCostDisplay = isBulk ? (
    <div className="font-mono text-[13px] sensitive">
      <div>{fmtRM(unitCost)} / {outerName}</div>
      <div className="text-[11px] text-[#6B6B6B] mt-0.5">
        = RM {costPerPc.toFixed(3)} / {innerName} <span className="opacity-60">(÷ {packSize.toLocaleString()} {innerName}/{outerName.toLowerCase()})</span>
      </div>
      {perPc !== null && (
        <div className="text-[11px] text-[#6B6B6B] mt-0.5">
          = RM {perPc.toFixed(4)} / pc <span className="opacity-60">({pcsPerInnerUnit} pc/{innerName}, from BOM)</span>
        </div>
      )}
    </div>
  ) : (
    <span className="font-mono sensitive">{fmtRM(unitCost)}</span>
  )

  const stockBalance = packaging.stock_balance != null ? Number(packaging.stock_balance) : null
  const uomLabel = packaging.uom || (isBulk ? outerName.toLowerCase() : '—')

  // Incoming is computed LIVE from open Packaging POs (via stockInfo).
  // Display in the packaging UOM where possible — divide pcs by pack_size for bulk.
  const incomingPcs = stockInfo.incomingQty
  const incomingOuter = isBulk && packSize > 1 ? Math.round(incomingPcs / packSize) : incomingPcs
  const incomingUnit = isBulk ? uomLabel : 'pc'
  const showIncoming = incomingPcs > 0

  const rows: [string, React.ReactNode][] = [
    ['Code', <span className="font-mono">{packaging.packaging_code}</span>],
    ['Name', packaging.packaging_name || '—'],
    ['Type', packaging.packaging_type ? <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-[#E8E5DE] text-[#3D3D3D]">{packaging.packaging_type}</span> : '—'],
    ['UOM', <span className="font-mono">{packaging.uom || '—'}</span>],
    ['Supplier', <span className="sensitive">{supplierName}</span>],
    ['Source Channel', packaging.source_channel ? <span className="sensitive">{packaging.source_channel}</span> : '—'],
    ['Unit Cost', unitCostDisplay],
    ['Stock Balance', stockBalance != null ? <span className="font-mono">{stockBalance.toLocaleString()} {uomLabel}</span> : <span className="text-[#6B6B6B]">—</span>],
    ['Incoming', showIncoming
      ? <span className="font-mono text-[#4A6B3D]">+{incomingOuter.toLocaleString()} {incomingUnit} <span className="text-[10px] text-[#6B6B6B] ml-1">(from open POs)</span></span>
      : <span className="text-[#6B6B6B]">—</span>
    ],
    ['MOQ', <span className="font-mono">{packaging.moq || '—'}</span>],
    ['Lead Time', <span className="font-mono">{fmtN(packaging.lead_time_days)} days</span>],
    ['Used by', <span className="font-mono">{usedByCount} FG SKU{usedByCount !== 1 ? 's' : ''}</span>],
    ['Notes', packaging.notes || '—'],
  ]

  return (
    <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
      <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
        <div className="font-medium text-[15px]">Packaging Master &amp; Purchase Metrics</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">Static fields</div>
      </div>
      <div>
        {rows.map(([k, v], i) => (
          <div
            key={k}
            className="grid grid-cols-[140px_1fr] gap-4 px-6 py-2.5 text-[13px]"
            style={{ borderTop: i === 0 ? 'none' : '1px solid #F0EDE4' }}
          >
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] flex items-center">{k}</div>
            <div>{v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function UsageVelocityCard({ info }: { info: VelocityInfo }) {
  return (
    <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
      <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
        <div className="font-medium text-[15px]">Usage Velocity</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">From FG movements × BOM</div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-[#F0EDE4]">
        <VelocityTile label="Last Month" value={<span className="sensitive">{info.lm.toLocaleString()}</span>} sub={info.trendLabel} />
        <VelocityTile label="L3M Avg" value={<span className="sensitive">{info.l3m.toLocaleString()}</span>} sub="" />
      </div>
      <div className="bg-white px-5 py-4 border-t border-[#F0EDE4]">
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1.5">L6M Avg</div>
        <div className="text-[22px] font-medium font-mono"><span className="sensitive">{info.l6m.toLocaleString()}</span> <span className="text-[12px] text-[#6B6B6B] font-mono">units/month</span></div>
        <div className="text-[11px] text-[#6B6B6B] mt-0.5">{info.trendLabel} · {info.velocityNote}</div>
      </div>
      <div
        className="px-5 py-4 border-t border-[#F0EDE4]"
        style={{ backgroundColor: info.stockMonths < 2.5 ? '#FFF5F1' : info.stockMonths < 3.5 ? '#FFF8ED' : '#F0F5ED' }}
      >
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1.5">Stock-Months Remaining</div>
        <div
          className="text-[28px] font-medium font-mono"
          style={{ color: info.stockMonths < 2.5 ? '#C8432C' : info.stockMonths < 3.5 ? '#B8860B' : '#4A6B3D' }}
        >
          {info.stockMonths >= 999 ? '∞' : info.stockMonths.toFixed(2)}
        </div>
        <div className="text-[11px] text-[#6B6B6B] mt-0.5 font-mono">
          Available {info.available.toLocaleString()} ÷ L3M <span className="sensitive">{info.l3m.toLocaleString()}</span> = {info.velocityNote}
        </div>
      </div>
    </div>
  )
}

function VelocityTile({ label, value, sub }: { label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="bg-white px-5 py-4">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1.5">{label}</div>
      <div className="text-[22px] font-medium font-mono">{value}</div>
      {sub && <div className="text-[11px] text-[#6B6B6B] mt-0.5 font-mono">{sub}</div>}
    </div>
  )
}

function UsedByPreviewCard({ fgUsers, costPerPc, packaging }: { fgUsers: any[]; costPerPc: number; packaging: any }) {
  if (fgUsers.length === 0) {
    return (
      <div className="bg-white border border-[#D4D0C7] rounded">
        <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] font-medium text-[15px]">Used By (FG SKUs)</div>
        <div className="px-6 py-8 text-center text-[#6B6B6B] text-[13px]">No FG SKUs currently reference this packaging.</div>
      </div>
    )
  }
  const isBulk = (Number(packaging.pack_size) || 1) > 1
  return (
    <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
      <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
        <div className="font-medium text-[15px]">Used By (FG SKUs)</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">
          Top {fgUsers.length} · via BOM
          {isBulk && <> · per-pc cost RM {costPerPc.toFixed(3)}</>}
        </div>
      </div>
      <table className="w-full text-[12px]">
        <thead className="bg-white border-b border-[#E8E5DE]">
          <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
            <th className="px-6 py-2.5">SKU</th>
            <th className="px-6 py-2.5">Product</th>
            <th className="px-6 py-2.5">Brand</th>
            <th className="px-6 py-2.5 text-right">Pcs per FG</th>
            <th className="px-6 py-2.5 text-right">Cost per FG Unit</th>
            <th className="px-6 py-2.5">Notes</th>
          </tr>
        </thead>
        <tbody>
          {fgUsers.map((u, i) => {
            const qty = Number(u.qty_per_unit) || 0
            const costPerFG = qty * costPerPc
            return (
              <tr key={u.product_sku || i} className="border-t border-[#F0EDE4]">
                <td className="px-6 py-2.5">
                  <Link href={`/products/${encodeURIComponent(u.product_sku)}`} className="font-mono text-[#C8432C] hover:underline">{u.product_sku}</Link>
                </td>
                <td className="px-6 py-2.5">{u.product_name}</td>
                <td className="px-6 py-2.5">{u.brand}</td>
                <td className="px-6 py-2.5 text-right font-mono font-semibold">{qty}</td>
                <td className="px-6 py-2.5 text-right font-mono">
                  <span className="sensitive">RM {costPerFG.toFixed(3)}{isBulk ? ` (${qty} × ${costPerPc.toFixed(3)})` : ''}</span>
                </td>
                <td className="px-6 py-2.5 text-[#6B6B6B]">{u.notes || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// USED BY TAB (full list)
// ============================================================================
function UsedByTab({ fgUsers, packaging }: { fgUsers: any[]; packaging: any }) {
  if (fgUsers.length === 0) {
    return (
      <div className="bg-white border border-[#D4D0C7] rounded px-7 py-12 text-center text-[#6B6B6B]">
        No FG SKUs use this packaging.
      </div>
    )
  }
  const packSize = Number(packaging.pack_size) || 1
  const costPerPc = packSize > 0 ? (Number(packaging.unit_cost) || 0) / packSize : 0
  const isBulk = packSize > 1
  return (
    <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
      <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
        <div className="font-medium text-[15px]">All FG SKUs using this packaging</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">
          {fgUsers.length} SKUs
          {isBulk && <> · per-pc cost RM {costPerPc.toFixed(3)}</>}
        </div>
      </div>
      <table className="w-full text-[12px]">
        <thead className="bg-white border-b border-[#E8E5DE]">
          <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
            <th className="px-6 py-2.5">SKU</th>
            <th className="px-6 py-2.5">Product</th>
            <th className="px-6 py-2.5">Brand</th>
            <th className="px-6 py-2.5 text-right">Pcs per FG</th>
            <th className="px-6 py-2.5 text-right">Cost per FG Unit</th>
            <th className="px-6 py-2.5">Notes</th>
          </tr>
        </thead>
        <tbody>
          {fgUsers.map((u, i) => {
            const qty = Number(u.qty_per_unit) || 0
            const costPerFG = qty * costPerPc
            return (
              <tr key={u.product_sku || i} className="border-t border-[#F0EDE4]">
                <td className="px-6 py-2.5">
                  <Link href={`/products/${encodeURIComponent(u.product_sku)}`} className="font-mono text-[#C8432C] hover:underline">{u.product_sku}</Link>
                </td>
                <td className="px-6 py-2.5">{u.product_name}</td>
                <td className="px-6 py-2.5">{u.brand}</td>
                <td className="px-6 py-2.5 text-right font-mono font-semibold">{qty}</td>
                <td className="px-6 py-2.5 text-right font-mono">
                  <span className="sensitive">RM {costPerFG.toFixed(3)}{isBulk ? ` (${qty} × ${costPerPc.toFixed(3)})` : ''}</span>
                </td>
                <td className="px-6 py-2.5 text-[#6B6B6B]">{u.notes || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// POs TAB
// ============================================================================
function POsTab({ pos, code }: { pos: any[]; code: string }) {
  if (pos.length === 0) {
    return (
      <div className="bg-white border border-[#D4D0C7] rounded px-7 py-12 text-center text-[#6B6B6B]">
        <div className="text-[14px] mb-1">No Purchase Orders found</div>
        <div className="text-[12px]">No POs reference packaging code {code} yet.</div>
      </div>
    )
  }
  return (
    <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
      <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
        <div className="font-medium text-[15px]">Purchase Orders containing this packaging</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">{pos.length} POs</div>
      </div>
      <table className="w-full text-[12px]">
        <thead className="bg-white border-b border-[#E8E5DE]">
          <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
            <th className="px-6 py-2.5">PO Number</th>
            <th className="px-6 py-2.5">Type</th>
            <th className="px-6 py-2.5">Status</th>
            <th className="px-6 py-2.5">Entity</th>
            <th className="px-6 py-2.5">Supplier</th>
            <th className="px-6 py-2.5 text-right">Qty (this code)</th>
            <th className="px-6 py-2.5">ETA</th>
          </tr>
        </thead>
        <tbody>
          {pos.map(po => {
            const items = (po.items || []).filter((it: any) => it.sku === code)
            const qty = items.reduce((s: number, it: any) => s + Number(it.qty || 0), 0)
            return (
              <tr key={po.id} className="border-t border-[#F0EDE4]">
                <td className="px-6 py-2.5 font-mono">{po.po_number}</td>
                <td className="px-6 py-2.5">{po.po_type}</td>
                <td className="px-6 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${statusColor[po.status] || 'bg-[#EDEAE2] text-[#6B6B6B]'}`}>{po.status}</span>
                </td>
                <td className="px-6 py-2.5">{po.entity_code}</td>
                <td className="px-6 py-2.5"><span className="sensitive">{po.supplier_name}</span></td>
                <td className="px-6 py-2.5 text-right font-mono">{fmtN(qty)}</td>
                <td className="px-6 py-2.5 font-mono text-[11px]">{po.expected_date || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const statusColor: Record<string, string> = {
  pending: 'bg-[#F5EDD6] text-[#8B6F1B]',
  approved: 'bg-[#E8EFE5] text-[#4A6B3D]',
  rejected: 'bg-[#F5DEDA] text-[#A53025]',
  received: 'bg-[#DDE7F0] text-[#2C5282]',
  cancelled: 'bg-[#EDEAE2] text-[#6B6B6B]',
}

// ============================================================================
// CONSUMPTION TAB
// ============================================================================
function ConsumptionTab({ movements, uom }: { movements: any[]; uom: string }) {
  if (movements.length === 0) {
    return (
      <div className="bg-white border border-[#D4D0C7] rounded p-12 text-center">
        <div className="text-[15px] text-[#1A1A1A] mb-2">No consumption recorded yet</div>
        <div className="text-[12px] text-[#6B6B6B] leading-relaxed max-w-[480px] mx-auto">
          When you mark an FG PO as received, the system automatically deducts this packaging from stock based on the BOM, and a row appears here for every consumption event.
        </div>
      </div>
    )
  }

  const totalConsumed = movements
    .filter(m => Number(m.qty_delta) < 0)
    .reduce((s, m) => s + Math.abs(Number(m.qty_delta) || 0), 0)
  const totalAdjusted = movements
    .filter(m => Number(m.qty_delta) > 0)
    .reduce((s, m) => s + Number(m.qty_delta || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <SummaryStat label="Total movements (last 30)" value={movements.length.toString()} />
        <SummaryStat label="Total consumed" value={`−${totalConsumed.toLocaleString()} ${uom}`} tone="warn" />
        <SummaryStat label="Total added back" value={totalAdjusted > 0 ? `+${totalAdjusted.toLocaleString()} ${uom}` : '—'} tone="ok" />
      </div>

      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
              <th className="px-4 py-2.5">Date</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5">Reason</th>
              <th className="px-4 py-2.5">FG Triggered</th>
              <th className="px-4 py-2.5 text-right" title="BOM ratio">Per Unit</th>
              <th className="px-4 py-2.5 text-right">Qty Delta</th>
              <th className="px-4 py-2.5">Source PO</th>
              <th className="px-4 py-2.5">By</th>
            </tr>
          </thead>
          <tbody>
            {movements.map(m => {
              const qty = Number(m.qty_delta) || 0
              return (
                <tr key={m.id} className="border-t border-[#F0EDE4] hover:bg-[#FAFAF7]">
                  <td className="px-4 py-2.5 font-mono text-[11px]">
                    {new Date(m.created_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' })}
                  </td>
                  <td className="px-4 py-2.5 text-[12px]">{m.movement_type || '—'}</td>
                  <td className="px-4 py-2.5 text-[11px] font-mono text-[#6B6B6B]">{m.reason || '—'}</td>
                  <td className="px-4 py-2.5">
                    {m.fg_sku ? (
                      <div>
                        <div className="font-mono text-[11px] text-[#C8432C]">{m.fg_sku}</div>
                        {m.fg_qty != null && <div className="text-[10px] text-[#6B6B6B]">× {Number(m.fg_qty).toLocaleString()} produced</div>}
                      </div>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-[11px] text-[#6B6B6B]">
                    {m.qty_per_unit != null ? Number(m.qty_per_unit).toLocaleString() : '—'}
                  </td>
                  <td className={`px-4 py-2.5 text-right font-mono font-semibold ${qty < 0 ? 'text-[#C8432C]' : 'text-[#4A6B3D]'}`}>
                    {qty < 0 ? '−' : '+'}{Math.abs(qty).toLocaleString()} {uom}
                  </td>
                  <td className="px-4 py-2.5">
                    {m.source_po_id ? (
                      <a href={`/purchase-orders/${m.source_po_id}`} className="text-[#C8432C] hover:underline text-[11px] font-mono">
                        view PO
                      </a>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-[11px]">{m.created_by || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'warn' }) {
  const color = tone === 'warn' ? '#C8432C' : tone === 'ok' ? '#4A6B3D' : '#1A1A1A'
  return (
    <div className="bg-white border border-[#D4D0C7] rounded p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">{label}</div>
      <div className="font-mono text-xl font-semibold mt-0.5" style={{ color }}>{value}</div>
    </div>
  )
}
