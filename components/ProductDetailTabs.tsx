'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { EditProductModal } from './EditProductModal'

type Tab = 'overview' | 'movements' | 'batches' | 'bom' | 'pos'

const VALID_TABS: Tab[] = ['overview', 'movements', 'batches', 'bom', 'pos']

const fmt = (n: any) => n == null || n === '' ? '—' : typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: 3 }) : n
const fmtN = (n: any) => n == null ? '—' : Number(n).toLocaleString()
const fmtRM = (n: any) => n == null ? '—' : `RM ${Number(n).toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`

type StockInfo = {
  openingStock: number
  openingDateLabel: string
  incomingQty: number
  incomingPoLabel: string
  incomingEta: string | null
  committedQty: number
  committedDesc: string
  availableQty: number
  safety: number
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

export function ProductDetailTabs({
  product, bom, suppliers, packaging, packagingByCode,
  stockInfo, velocityInfo, entity, entityName, supplierMap, pos, commitments, movements,
}: {
  product: any
  bom: any[]
  suppliers: any[]
  packaging: any[]
  packagingByCode: Record<string, any>
  stockInfo: StockInfo
  velocityInfo: VelocityInfo
  entity: string
  entityName: string
  supplierMap: Record<string, string>
  pos: any[]
  commitments: any[]
  movements: any[]
}) {
  const searchParams = useSearchParams()
  const initialTab = (() => {
    const t = (searchParams?.get('tab') || '').toLowerCase()
    return (VALID_TABS as string[]).includes(t) ? (t as Tab) : 'overview'
  })()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [editing, setEditing] = useState(false)

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'movements', label: 'Stock Movements', count: movements.length },
    { key: 'batches', label: 'Batches' },
    { key: 'bom', label: 'BOM', count: bom.length },
    { key: 'pos', label: 'POs', count: pos.length },
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
          title="Coming soon — pre-filled Draft PO from this SKU"
          style={{ backgroundColor: '#1A1A1A', color: '#FAFAF7', padding: '8px 16px', borderRadius: '4px', fontSize: '13px', border: 'none', cursor: 'not-allowed', opacity: 0.6 }}
        >
          Create PO
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', borderBottom: '1px solid #D4D0C7', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
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
        {/* Tab-specific action button slot — appears on the same row as the
            tabs, right-aligned, so it doesn't push the BOM table down. */}
        {tab === 'bom' && (
          <div style={{ paddingBottom: '8px' }}>
            <BomEditingBar sku={product.sku} packaging={packaging} suppliers={suppliers} />
          </div>
        )}
      </div>

      {tab === 'overview' && (
        <OverviewTab
          product={product}
          stockInfo={stockInfo}
          velocityInfo={velocityInfo}
          entity={entity}
          entityName={entityName}
          supplierMap={supplierMap}
          movements={movements}
        />
      )}
      {tab === 'movements' && <MovementsTab movements={movements} />}
      {tab === 'batches' && <ComingSoon name="Batches" hint="Batch tracking schema to be added." />}
      {tab === 'bom' && <BOMTab product={product} bom={bom} packagingByCode={packagingByCode} packaging={packaging} suppliers={suppliers} />}
      {tab === 'pos' && <POsTab pos={pos} sku={product.sku} />}

      {editing && (
        <EditProductModal
          product={product}
          suppliers={suppliers}
          bomLines={bom}
          packaging={packaging}
          onClose={() => setEditing(false)}
        />
      )}
    </>
  )
}

// ============================================================================
// OVERVIEW TAB
// ============================================================================
function OverviewTab({
  product, stockInfo, velocityInfo, entity, entityName, supplierMap, movements,
}: {
  product: any
  stockInfo: StockInfo
  velocityInfo: VelocityInfo
  entity: string
  entityName: string
  supplierMap: Record<string, string>
  movements: any[]
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Stock Position */}
      <StockPositionCard info={stockInfo} />

      {/* Two-column: Master + Sales Velocity */}
      <div className="grid grid-cols-[1.4fr_1fr] gap-6">
        <ProductMasterCard product={product} entity={entity} entityName={entityName} supplierMap={supplierMap} />
        <SalesVelocityCard info={velocityInfo} />
      </div>

      {/* Recent Movements */}
      <RecentMovementsCard movements={movements.slice(0, 8)} />
    </div>
  )
}

function StockPositionCard({ info }: { info: StockInfo }) {
  // On hand = gsheet column D (warehouse-confirmed). Already net of any
  // commitments — warehouse counts physical units only after pulling out
  // committed stock. So we do NOT subtract committed again here.
  //
  // Projected = on hand + incoming PO. Committed is shown as a record
  // (informational) so you can see what's locked up against campaigns,
  // but it doesn't change Available.
  const onHand = info.openingStock
  const projected = onHand + info.incomingQty
  const incomingSub = info.incomingPoLabel
    ? `${info.incomingPoLabel}${info.incomingEta ? ` · ETA ${info.incomingEta}` : ''}`
    : 'No open POs'
  const committedSub = info.committedDesc || 'No commitments'

  return (
    <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
      <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
        <div className="font-medium text-[15px]">Stock Position</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">Real-time · gsheet Available is truth</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* LEFT: On Hand (what you actually have today, matches FG Inventory) */}
        <div className="p-6 bg-[#FFF5F1] border-b md:border-b-0 md:border-r border-[#D4D0C7]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-2">
            On Hand · matches FG Inventory
          </div>
          <div className="text-[40px] font-medium font-mono leading-none" style={{ color: info.isHealthy ? '#4A6B3D' : '#C8432C' }}>
            {onHand.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#6B6B6B] mt-2 font-mono">
            {info.openingDateLabel} · {info.healthLabel}
          </div>
          <div className="text-[10px] text-[#6B6B6B] mt-2 leading-relaxed">
            This is what your warehouse currently holds. Incoming POs don't roll in until the next daily upload.
          </div>
        </div>

        {/* RIGHT: Projected breakdown (informational) */}
        <div className="p-6">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-3">
            Projected after PO + commitments
          </div>
          <div className="flex flex-col gap-1.5 font-mono text-[13px]">
            <BreakdownRow label="Opening" value={onHand} />
            <BreakdownRow label="+ Incoming (PO)" value={info.incomingQty} sub={incomingSub} positive />
            <div className="border-t border-[#E8E5DE] mt-1 pt-2 flex justify-between items-baseline">
              <span className="text-[11px] uppercase tracking-wider text-[#6B6B6B]">= Projected</span>
              <span className="text-[22px] font-medium" style={{ color: '#2C5282' }}>{projected.toLocaleString()}</span>
            </div>
            <div className="mt-1 pt-2 border-t border-dashed border-[#E8E5DE]">
              <BreakdownRow
                label="Committed (as record)"
                value={info.committedQty}
                sub={committedSub}
                muted
              />
              <div className="text-[10px] text-[#6B6B6B] mt-1 italic">
                Already deducted in gsheet Available — shown here for visibility only.
              </div>
            </div>
          </div>
          <div className="text-[10px] text-[#6B6B6B] mt-3 leading-relaxed">
            Informational only. Available stays at On Hand until you record the PO receipt.
          </div>
        </div>
      </div>
    </div>
  )
}

function BreakdownRow({ label, value, sub, positive, negative, muted }: { label: string; value: number; sub?: string; positive?: boolean; negative?: boolean; muted?: boolean }) {
  const color = muted ? '#6B6B6B' : positive ? '#4A6B3D' : negative ? '#C8432C' : '#1A1A1A'
  return (
    <div className="flex justify-between items-baseline gap-3">
      <div className="flex flex-col min-w-0 flex-1">
        <span className={muted ? 'text-[#6B6B6B]' : 'text-[#1A1A1A]'}>{label}</span>
        {sub && <span className="text-[10px] text-[#6B6B6B] truncate">{sub}</span>}
      </div>
      <span className="font-mono whitespace-nowrap" style={{ color }}>{value.toLocaleString()}</span>
    </div>
  )
}

function ProductMasterCard({ product, entity, entityName, supplierMap }: { product: any; entity: string; entityName: string; supplierMap: Record<string, string> }) {
  const oemName = product.oem_supplier_code ? (supplierMap[product.oem_supplier_code] || product.oem_supplier_code) : '—'
  const billingName = product.billing_supplier_code ? (supplierMap[product.billing_supplier_code] || product.billing_supplier_code) : '—'

  const rows: [string, React.ReactNode][] = [
    ['SKU', <span className="font-mono">{product.sku}</span>],
    ['Barcode', <span className="font-mono">{product.barcode || '—'}</span>],
    ['Brand / Entity', <span>{product.brand}{entityName ? ` / ${entityName}` : ''}</span>],
    ['OEM', <span className="sensitive">{oemName}</span>],
    ['Billed by', <span className="sensitive">{billingName}</span>],
    ['Unit Cost', <span className="font-mono sensitive">{fmtRM(product.unit_cost)}</span>],
    ['Selling Price', <span className="font-mono sensitive">{fmtRM(product.selling_price)}</span>],
    ['MOQ', <span className="font-mono">{fmtN(product.moq)} units</span>],
    ['Safety Stock', <span className="font-mono">{fmtN(product.safety_stock_qty)} units</span>],
    ['Lead Time', <span className="font-mono">{fmtN(product.lead_time_days)} days</span>],
    ['Qty per Carton', <span className="font-mono">{fmtN(product.qty_per_carton)}</span>],
    ['Shelf Life', product.shelf_life_months ? <span className="font-mono">{product.shelf_life_months} months</span> : '—'],
    ['Status', <span className="font-mono uppercase text-[11px]">{product.product_status || 'active'}</span>],
  ]

  return (
    <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
      <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
        <div className="font-medium text-[15px]">Product Master &amp; Purchase Metrics</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">Static fields + calculated metrics</div>
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

function SalesVelocityCard({ info }: { info: VelocityInfo }) {
  return (
    <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
      <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
        <div className="font-medium text-[15px]">Sales Velocity</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">Calculated from movements</div>
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

function RecentMovementsCard({ movements }: { movements: any[] }) {
  if (movements.length === 0) {
    return (
      <div className="bg-white border border-[#D4D0C7] rounded">
        <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] font-medium text-[15px]">Recent Movements</div>
        <div className="px-6 py-8 text-center text-[#6B6B6B] text-[13px]">No recent stock movements for this SKU.</div>
      </div>
    )
  }
  return (
    <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
      <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
        <div className="font-medium text-[15px]">Recent Movements</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">Last 8 entries</div>
      </div>
      <table className="w-full text-[12px]">
        <thead className="bg-white border-b border-[#E8E5DE]">
          <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
            <th className="px-6 py-2.5">Date</th>
            <th className="px-6 py-2.5">Brand</th>
            <th className="px-6 py-2.5">Warehouse</th>
            <th className="px-6 py-2.5 text-right">Starting</th>
            <th className="px-6 py-2.5 text-right">In</th>
            <th className="px-6 py-2.5 text-right">Out</th>
            <th className="px-6 py-2.5 text-right">Closing</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m, i) => (
            <tr key={m.id || i} className="border-t border-[#F0EDE4]">
              <td className="px-6 py-2.5 font-mono">{m.date_start || '—'}</td>
              <td className="px-6 py-2.5">{m.brand || '—'}</td>
              <td className="px-6 py-2.5">{m.warehouse || '—'}</td>
              <td className="px-6 py-2.5 text-right font-mono text-[#6B6B6B]">{fmtN(m.starting)}</td>
              <td className="px-6 py-2.5 text-right font-mono text-[#2C5282]">{m.in_qty ? `+${fmtN(m.in_qty)}` : '—'}</td>
              <td className="px-6 py-2.5 text-right font-mono text-[#C8432C]">{m.out_qty ? `-${fmtN(m.out_qty)}` : '—'}</td>
              <td className="px-6 py-2.5 text-right font-mono font-semibold">{fmtN(m.closing)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// STOCK MOVEMENTS TAB
// ============================================================================
function MovementsTab({ movements }: { movements: any[] }) {
  if (movements.length === 0) {
    return <ComingSoon name="Stock Movements" hint="No movements recorded for this SKU yet. Upload monthly Excel via Stock Movements page." />
  }
  return (
    <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
      <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
        <div className="font-medium text-[15px]">All Stock Movements</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">{movements.length} entries</div>
      </div>
      <table className="w-full text-[12px]">
        <thead className="bg-white border-b border-[#E8E5DE]">
          <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
            <th className="px-6 py-2.5">Date Start</th>
            <th className="px-6 py-2.5">Date End</th>
            <th className="px-6 py-2.5">Brand</th>
            <th className="px-6 py-2.5">Warehouse</th>
            <th className="px-6 py-2.5">Detail</th>
            <th className="px-6 py-2.5 text-right">Starting</th>
            <th className="px-6 py-2.5 text-right">In</th>
            <th className="px-6 py-2.5 text-right">Out</th>
            <th className="px-6 py-2.5 text-right">Closing</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m, i) => (
            <tr key={m.id || i} className="border-t border-[#F0EDE4]">
              <td className="px-6 py-2.5 font-mono">{m.date_start || '—'}</td>
              <td className="px-6 py-2.5 font-mono">{m.date_end || '—'}</td>
              <td className="px-6 py-2.5">{m.brand || '—'}</td>
              <td className="px-6 py-2.5">{m.warehouse || '—'}</td>
              <td className="px-6 py-2.5 text-[#6B6B6B]">{m.detail || '—'}</td>
              <td className="px-6 py-2.5 text-right font-mono text-[#6B6B6B]">{fmtN(m.starting)}</td>
              <td className="px-6 py-2.5 text-right font-mono text-[#2C5282]">{m.in_qty ? `+${fmtN(m.in_qty)}` : '—'}</td>
              <td className="px-6 py-2.5 text-right font-mono text-[#C8432C]">{m.out_qty ? `-${fmtN(m.out_qty)}` : '—'}</td>
              <td className="px-6 py-2.5 text-right font-mono font-semibold">{fmtN(m.closing)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// POs TAB
// ============================================================================
function POsTab({ pos, sku }: { pos: any[]; sku: string }) {
  if (pos.length === 0) {
    return <ComingSoon name="POs" hint={`No Purchase Orders found for SKU ${sku}.`} />
  }
  return (
    <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
      <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
        <div className="font-medium text-[15px]">Purchase Orders containing this SKU</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">{pos.length} POs</div>
      </div>
      <table className="w-full text-[12px]">
        <thead className="bg-white border-b border-[#E8E5DE]">
          <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
            <th className="px-6 py-2.5">PO Number</th>
            <th className="px-6 py-2.5">Status</th>
            <th className="px-6 py-2.5">Entity</th>
            <th className="px-6 py-2.5">Supplier</th>
            <th className="px-6 py-2.5 text-right">Qty (this SKU)</th>
            <th className="px-6 py-2.5 text-right">Unit Cost</th>
            <th className="px-6 py-2.5 text-right">Line Amount</th>
            <th className="px-6 py-2.5">ETA</th>
          </tr>
        </thead>
        <tbody>
          {pos.map(po => {
            const items = (po.items || []).filter((it: any) => it.sku === sku)
            const qty = items.reduce((s: number, it: any) => s + Number(it.qty || 0), 0)
            const amount = items.reduce((s: number, it: any) => s + Number(it.amount || 0), 0)
            const unitCost = items[0]?.unit_cost ?? 0
            return (
              <tr key={po.id} className="border-t border-[#F0EDE4]">
                <td className="px-6 py-2.5 font-mono">{po.po_number}</td>
                <td className="px-6 py-2.5">
                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${statusColor[po.status] || 'bg-[#EDEAE2] text-[#6B6B6B]'}`}>{po.status}</span>
                </td>
                <td className="px-6 py-2.5">{po.entity_code}</td>
                <td className="px-6 py-2.5"><span className="sensitive">{po.supplier_name}</span></td>
                <td className="px-6 py-2.5 text-right font-mono">{fmtN(qty)}</td>
                <td className="px-6 py-2.5 text-right font-mono"><span className="sensitive">{fmtRM(unitCost)}</span></td>
                <td className="px-6 py-2.5 text-right font-mono"><span className="sensitive">{fmtRM(amount)}</span></td>
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
// BOM TAB (preserved from previous version)
// ============================================================================
function BOMTab({ product, bom, packagingByCode, packaging, suppliers }: { product: any; bom: any[]; packagingByCode: Record<string, any>; packaging: any[]; suppliers: any[] }) {
  let packagingSubtotal = 0
  const lines = bom.map(b => {
    const pkg = packagingByCode[b.packaging_code]
    const packSize = pkg?.pack_size ?? 1
    const unitCost = pkg?.unit_cost ?? 0
    const pkgUom = (pkg?.uom || '').trim()
    const innerIsPc = !pkgUom || /^pcs?$/i.test(pkgUom)
    // Per inner-Uom cost. If uom='pc' this is per pc; if uom='Unit' it's per Unit.
    const perInnerUnit = packSize > 0 ? unitCost / packSize : 0
    // Cost per 1 FG:
    //   uom='pc' → per_pc × qty_per_unit (qty_per_unit is in pcs)
    //   uom='Unit' / non-pc bulk → 1 inner Unit per FG, so just the per-Unit cost
    //     (qty_per_unit then represents pcs/FG, which equals pcs/Unit because 1 FG = 1 Unit)
    const qty = Number(b.qty_per_unit ?? 0)
    const lineCost = innerIsPc ? perInnerUnit * qty : perInnerUnit
    // Per-pc display value (always in real pcs)
    const perPcReal = innerIsPc ? perInnerUnit : (qty > 0 ? perInnerUnit / qty : null)
    packagingSubtotal += lineCost
    return {
      ...b,
      packaging_name: pkg?.packaging_name || b.packaging_code,
      unit_cost: pkg?.unit_cost ?? null,
      pack_size: packSize,
      line_cost: lineCost,
      uom: pkgUom,
      per_pc_real: perPcReal,
      inner_is_pc: innerIsPc,
    }
  })
  const fgUnitCost = product.unit_cost ?? 0
  const totalCogs = packagingSubtotal + fgUnitCost
  const sellingPrice = product.selling_price ?? 0
  const grossMargin = sellingPrice > 0 ? ((sellingPrice - totalCogs) / sellingPrice) * 100 : 0
  const grossProfit = sellingPrice - totalCogs

  // If no packaging BOM entries, still show FG-only row + cost breakdown

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
        <div className="px-7 py-5 bg-[#FAFAF7] border-b border-[#D4D0C7]">
          <div className="font-medium text-[16px]">{product.product_name} · Bill of Materials</div>
          <div className="font-mono text-[11px] text-[#6B6B6B] mt-1">{bom.length} packaging + 1 FG · per 1 unit of FG</div>
        </div>
        <table className="w-full text-[12px] table-auto">
          <colgroup>
            <col style={{ width: '32%' }} />{/* Item */}
            <col style={{ width: '20%' }} />{/* Code */}
            <col style={{ width: '70px' }} />{/* Type */}
            <col style={{ width: '90px' }} />{/* Qty */}
            <col style={{ width: '90px' }} />{/* Source */}
            <col style={{ width: '120px' }} />{/* Cost */}
            <col />{/* Notes — flex */}
            <col style={{ width: '110px' }} />{/* Action */}
          </colgroup>
          <thead className="bg-white border-b border-[#E8E5DE]">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
              <th className="px-4 py-3">Item</th>
              <th className="px-3 py-3">Code</th>
              <th className="px-2 py-3">Type</th>
              <th className="px-2 py-3 text-right">Qty / Unit</th>
              <th className="px-2 py-3">Source</th>
              <th className="px-2 py-3 text-right">Cost / FG (RM)</th>
              <th className="px-3 py-3">Notes</th>
              <th className="px-2 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((b, idx) => {
              const packSize = Number(b.pack_size) || 1
              const isBulk = packSize > 1
              const rawCost = b.unit_cost != null ? Number(b.unit_cost) : null
              const outer = b.type && /foil/i.test(b.type) ? 'Roll' : 'Pack'
              return (
                <tr key={b.id || idx} className="border-t border-[#E8E5DE]">
                  <td className="px-4 py-3 font-medium">{b.packaging_name}</td>
                  <td className="px-3 py-3 font-mono text-[11px]">
                    <Link href={`/packaging/${encodeURIComponent(b.packaging_code)}`} className="text-[#C8432C] hover:underline">{b.packaging_code}</Link>
                  </td>
                  <td className="px-2 py-3">
                    {b.type && <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-[#E8E5DE] text-[#3D3D3D] whitespace-nowrap">{b.type}</span>}
                  </td>
                  <td className="px-2 py-3 font-mono text-right">
                    {isBulk ? (
                      <div>
                        <div className="font-semibold">1 unit</div>
                        <div className="text-[10px] text-[#6B6B6B] mt-0.5">= {fmt(b.qty_per_unit)} pcs</div>
                      </div>
                    ) : (
                      <span className="font-semibold">{fmt(b.qty_per_unit)}</span>
                    )}
                  </td>
                  <td className="px-2 py-3 font-mono text-[10px] whitespace-nowrap">{b.source ? <span className="sensitive">{b.source}</span> : '—'}</td>
                  <td className="px-2 py-3 font-mono text-right">
                    {rawCost == null ? '—' : (
                      <div className="sensitive">
                        <div>RM {b.line_cost.toFixed(3)}</div>
                        {isBulk && b.per_pc_real != null && (
                          <div className="text-[10px] text-[#6B6B6B] mt-0.5 whitespace-nowrap">
                            {b.qty_per_unit} × {b.per_pc_real.toFixed(4)} <span className="opacity-60">({rawCost.toFixed(3)}/{outer})</span>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[#6B6B6B] text-[11px]">{b.notes || '—'}</td>
                  <td className="px-2 py-3 text-right whitespace-nowrap">
                    <BomRowActions bom={b} suppliers={suppliers} />
                  </td>
                </tr>
              )
            })}
            {/* FG unit cost row */}
            <tr className="border-t border-[#E8E5DE] bg-[#FFF8F5]">
              <td className="px-4 py-3 font-medium">Finished Goods (filled by OEM)</td>
              <td className="px-3 py-3 font-mono text-[11px]">{product.sku}</td>
              <td className="px-2 py-3">
                <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-[#F5DEDA] text-[#A53025]">FG</span>
              </td>
              <td className="px-2 py-3 font-mono font-semibold text-right">1</td>
              <td className="px-2 py-3 font-mono text-[10px] whitespace-nowrap">{product.oem_supplier_code || '—'}</td>
              <td className="px-2 py-3 font-mono text-right">{product.unit_cost != null ? <span className="sensitive">RM {Number(product.unit_cost).toFixed(3)}</span> : '—'}</td>
              <td className="px-3 py-3 text-[#6B6B6B] text-[11px]">FG unit cost from OEM (excludes packaging)</td>
              <td className="px-2 py-3"></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
        <div className="px-7 py-5 bg-[#FAFAF7] border-b border-[#D4D0C7]">
          <div className="font-medium text-[16px]">Cost Breakdown per Unit</div>
          <div className="font-mono text-[11px] text-[#6B6B6B] mt-1">Packaging + FG · excluding logistics</div>
        </div>
        <div>
          {lines.map((b, idx) => (
            <div key={idx} className="flex justify-between px-7 py-3 text-[13px]" style={{ borderTop: idx === 0 ? 'none' : '1px solid #E8E5DE' }}>
              <div>{b.packaging_name} × {fmt(b.qty_per_unit)}</div>
              <div className="font-mono"><span className="sensitive">RM {b.line_cost.toFixed(3)}</span></div>
            </div>
          ))}
          <div className="flex justify-between px-7 py-3 text-[13px] bg-[#FAFAF7] border-t border-[#E8E5DE] font-medium">
            <div>Packaging subtotal</div>
            <div className="font-mono"><span className="sensitive">RM {packagingSubtotal.toFixed(3)}</span></div>
          </div>
          <div className="flex justify-between px-7 py-3 text-[13px] border-t border-[#E8E5DE]">
            <div>FG unit cost (from OEM)</div>
            <div className="font-mono"><span className="sensitive">RM {fgUnitCost.toFixed(3)}</span></div>
          </div>
          <div className="flex justify-between px-7 py-3 text-[13px] bg-[#F5E4E0] border-t border-[#E8E5DE] font-medium">
            <div>Total COGS per unit</div>
            <div className="font-mono text-[#C8432C]"><span className="sensitive">RM {totalCogs.toFixed(3)}</span></div>
          </div>
          <div className="flex justify-between px-7 py-3 text-[13px] border-t border-[#E8E5DE]">
            <div>Selling price</div>
            <div className="font-mono"><span className="sensitive">RM {sellingPrice.toFixed(3)}</span></div>
          </div>
          <div className="flex justify-between px-7 py-3 text-[13px] border-t border-[#E8E5DE] font-medium">
            <div className="text-[#4A6B3D]">Gross margin</div>
            <div className="font-mono text-[#4A6B3D]"><span className="sensitive">{grossMargin.toFixed(1)}% (RM {grossProfit.toFixed(3)})</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ComingSoon({ name, hint }: { name: string; hint: string }) {
  return (
    <div className="bg-white border border-[#D4D0C7] rounded px-7 py-12 text-center">
      <div className="text-[16px] font-medium mb-2">{name}</div>
      <div className="text-[13px] text-[#6B6B6B]">{hint}</div>
    </div>
  )
}

// ============================================================================
// BOM editing — per-row Edit/Delete + Add new line. Reuses /api/bom routes.
// ============================================================================

function BomRowActions({ bom, suppliers }: { bom: any; suppliers: any[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)

  async function remove() {
    if (!confirm(`Remove ${bom.packaging_code} from this product's BOM?`)) return
    const res = await fetch(`/api/bom/${bom.id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
    else alert((await res.json()).error || 'Delete failed')
  }

  return (
    <>
      <button
        onClick={() => setEditing(true)}
        className="px-2 py-1 border border-[#D4D0C7] rounded text-[11px] text-[#3D3D3D] hover:bg-[#FAFAF7] mr-1"
      >Edit</button>
      <button
        onClick={remove}
        className="px-2 py-1 border border-[#A53025] text-[#A53025] rounded text-[11px] hover:bg-[#F5DEDA]"
      >Delete</button>
      {editing && <BomLineModal bom={bom} suppliers={suppliers} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); router.refresh() }} />}
    </>
  )
}

function BomEditingBar({ sku, packaging, suppliers }: { sku: string; packaging: any[]; suppliers: any[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  return (
    <>
      <button
        onClick={() => setAdding(true)}
        className="px-3 py-1.5 bg-[#1A1A1A] text-white rounded text-[12px] hover:bg-[#C8432C] transition-colors"
      >+ Add BOM line</button>
      {adding && (
        <BomLineModal
          bom={null}
          sku={sku}
          packaging={packaging}
          suppliers={suppliers}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); router.refresh() }}
        />
      )}
    </>
  )
}

function BomLineModal({
  bom, sku, packaging, suppliers, onClose, onSaved,
}: {
  bom: any | null
  sku?: string
  packaging?: any[]
  suppliers: any[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!bom
  const [form, setForm] = useState({
    packaging_code: bom?.packaging_code || '',
    qty_per_unit: bom?.qty_per_unit?.toString() || '1',
    source: bom?.source || '',
    notes: bom?.notes || '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setSubmitting(true); setError('')
    try {
      const url = isEdit ? `/api/bom/${bom.id}` : '/api/bom'
      const payload: any = {
        qty_per_unit: Number(form.qty_per_unit) || 0,
        source: form.source || null,
        notes: form.notes || null,
      }
      if (!isEdit) {
        payload.product_sku = sku
        payload.packaging_code = form.packaging_code
      }
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed'); return }
      onSaved()
    } catch (e: any) { setError(e.message) } finally { setSubmitting(false) }
  }

  const input = 'w-full px-3 py-2 border border-[#D4D0C7] rounded text-[13px] focus:outline-none focus:border-[#C8432C]'
  const label = 'block font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1.5 font-semibold'

  return (
    <div onClick={() => !submitting && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg shadow-2xl w-full max-w-[480px] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-[#D4D0C7] flex justify-between items-center">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1">{isEdit ? 'Edit BOM line' : 'New BOM line'}</div>
            <h2 className="text-[18px] font-medium">{isEdit ? bom.packaging_code : 'Add packaging component'}</h2>
          </div>
          <button onClick={onClose} className="text-[24px] text-[#6B6B6B] leading-none px-2">×</button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-3">
          {!isEdit && (
            <div>
              <label className={label}>Packaging *</label>
              <select value={form.packaging_code} onChange={e => setForm({ ...form, packaging_code: e.target.value })} className={input}>
                <option value="">— Pick packaging —</option>
                {(packaging || []).map((p: any) => (
                  <option key={p.packaging_code} value={p.packaging_code}>
                    {p.packaging_code} · {p.packaging_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={label}>Qty per FG unit *</label>
            <input type="number" step="0.0001" value={form.qty_per_unit} onChange={e => setForm({ ...form, qty_per_unit: e.target.value })} className={input} />
          </div>
          <div>
            <label className={label}>Source (supplier)</label>
            <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className={input}>
              <option value="">—</option>
              {suppliers.map((s: any) => <option key={s.supplier_code} value={s.supplier_code}>{s.supplier_code} · {s.supplier_name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Notes</label>
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={input + ' min-h-[60px]'} />
          </div>
          {error && <div className="p-3 bg-[#F5DEDA] border border-[#A53025] rounded text-[#A53025] text-[12px]">{error}</div>}
        </div>
        <div className="px-6 py-4 border-t border-[#D4D0C7] flex justify-end gap-2">
          <button onClick={onClose} disabled={submitting} className="px-3 py-2 text-[#6B6B6B] text-[13px]">Cancel</button>
          <button onClick={submit} disabled={submitting || (!isEdit && !form.packaging_code) || !form.qty_per_unit} className="px-4 py-2 bg-[#1A1A1A] text-white rounded text-[13px] disabled:opacity-50">
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Line'}
          </button>
        </div>
      </div>
    </div>
  )
}
