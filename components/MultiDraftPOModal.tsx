'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { brandToEntity } from '@/lib/entity-map'

type Row = {
  sku: string
  brand: string
  product_name: string
  available: number
  safety: number
  stock_months: number
  suggest_qty: number | null
  moq: number
  unit_cost: number
  supplier_code: string | null
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

type DraftItem = {
  rowKey: string
  // identity
  sku: string
  brand: string
  product_name: string
  // pricing
  supplier_code: string
  qty: number              // qty in order unit (Rolls for foil, Each for bottles, etc.)
  uom: string
  unit_cost: number        // cost per order unit
  po_type: 'FG' | 'Packaging'
  reason: string
  // BOM linkage
  parent_sku?: string      // present if this is auto-added packaging line
  qty_per_unit?: number    // pcs per FG unit (from BOM)
  pack_size?: number       // pcs per pack/roll (1 if no packing)
}

function outerUom(type: string | null, packSize: number): string {
  if (packSize > 1) {
    if (type && /foil/i.test(type)) return 'Roll'
    if (type && /label|sticker/i.test(type)) return 'Roll'
    return 'Pack'
  }
  return type || 'Unit'
}

function pcsToOrderQty(pcsNeeded: number, packSize: number): number {
  if (packSize > 1) return Math.ceil(pcsNeeded / packSize)
  return pcsNeeded
}

export function MultiDraftPOModal({
  rows,
  suppliers,
  entities,
  bomBySku,
  onClose,
}: {
  rows: Row[]
  suppliers: Supplier[]
  entities: Entity[]
  bomBySku: Record<string, BomItem[]>
  onClose: () => void
}) {
  const router = useRouter()
  const [drafted_by, setDraftedBy] = useState<string>('Jun Ye')
  const [terms, setTerms] = useState<string>('Net 30 days')
  const [expected_date, setExpectedDate] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Build initial line items: each FG row expanded into FG + N packaging children
  const [items, setItems] = useState<DraftItem[]>(() => {
    const list: DraftItem[] = []
    for (const r of rows) {
      const fgQty = r.suggest_qty ?? r.moq ?? 0
      // FG parent line
      list.push({
        rowKey: `FG::${r.brand}::${r.sku}`,
        sku: r.sku,
        brand: r.brand,
        product_name: r.product_name,
        supplier_code: r.supplier_code || '',
        qty: fgQty,
        uom: 'BTL',
        unit_cost: r.unit_cost || 0,
        po_type: 'FG',
        reason: `Stock-mo ${r.stock_months.toFixed(2)} · available ${r.available.toLocaleString()} · safety ${r.safety.toLocaleString()}`,
      })
      // BOM packaging children
      const bom = bomBySku[r.sku] || []
      for (const b of bom) {
        const pcsNeeded = b.qty_per_unit * fgQty
        const packSize = b.pack_size || 1
        const orderQty = pcsToOrderQty(pcsNeeded, packSize)
        const uom = outerUom(b.type, packSize)
        const reason = packSize > 1
          ? `For ${r.sku} · ${b.qty_per_unit} pcs/unit × ${fgQty.toLocaleString()} = ${pcsNeeded.toLocaleString()} pcs ÷ ${packSize.toLocaleString()}/${uom.toLowerCase()} = ${orderQty} ${uom}`
          : `For ${r.sku} · ${b.qty_per_unit}/unit`
        list.push({
          rowKey: `PKG::${r.brand}::${r.sku}::${b.code}`,
          sku: b.code,
          brand: r.brand,
          product_name: b.name,
          supplier_code: b.supplier_code || '',
          qty: orderQty,
          uom,
          unit_cost: b.unit_cost,
          po_type: 'Packaging',
          reason,
          parent_sku: r.sku,
          qty_per_unit: b.qty_per_unit,
          pack_size: packSize,
        })
      }
    }
    return list
  })

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems(prev => {
      const next = prev.map(it => (it.rowKey === key ? { ...it, ...patch } : it))
      // If a parent FG qty changed, recompute its packaging children (rolls/pcs aware)
      if (patch.qty != null) {
        const changed = next.find(it => it.rowKey === key)
        if (changed && changed.po_type === 'FG') {
          return next.map(it => {
            if (it.parent_sku !== changed.sku || it.qty_per_unit == null) return it
            const pcsNeeded = it.qty_per_unit * changed.qty
            const ps = it.pack_size || 1
            const newQty = pcsToOrderQty(pcsNeeded, ps)
            const reason = ps > 1
              ? `For ${changed.sku} · ${it.qty_per_unit} pcs/unit × ${changed.qty.toLocaleString()} = ${pcsNeeded.toLocaleString()} pcs ÷ ${ps.toLocaleString()}/${it.uom.toLowerCase()} = ${newQty} ${it.uom}`
              : `For ${changed.sku} · ${it.qty_per_unit}/unit`
            return { ...it, qty: newQty, reason }
          })
        }
      }
      return next
    })
  }

  function removeItem(key: string) {
    setItems(prev => {
      const target = prev.find(it => it.rowKey === key)
      if (!target) return prev
      // If removing an FG parent, also remove its children
      if (target.po_type === 'FG') {
        return prev.filter(it => it.rowKey !== key && it.parent_sku !== target.sku)
      }
      return prev.filter(it => it.rowKey !== key)
    })
  }

  const supplierName = (code: string) =>
    suppliers.find(s => s.supplier_code === code)?.supplier_name || code

  // Group by (entity_code, supplier_code, po_type)
  const groups = useMemo(() => {
    type Group = {
      key: string
      entity_code: string
      supplier_code: string
      po_type: 'FG' | 'Packaging'
      items: DraftItem[]
    }
    const g = new Map<string, Group>()
    for (const it of items) {
      if (!it.supplier_code) continue
      const entity = brandToEntity(it.brand)
      if (!entity) continue
      const k = `${entity}::${it.supplier_code}::${it.po_type}`
      if (!g.has(k))
        g.set(k, { key: k, entity_code: entity, supplier_code: it.supplier_code, po_type: it.po_type, items: [] })
      g.get(k)!.items.push(it)
    }
    return Array.from(g.values())
  }, [items])

  const unassigned = items.filter(it => !it.supplier_code || !brandToEntity(it.brand))

  async function handleSubmit() {
    if (items.length === 0) return setError('No items')
    if (unassigned.length > 0)
      return setError(`${unassigned.length} item(s) missing supplier or unknown brand entity`)
    if (items.some(it => it.qty <= 0)) return setError('Qty must be > 0 for all items')

    setSubmitting(true)
    setError(null)

    const pos = groups.map(g => {
      const entity = entities.find(e => e.code === g.entity_code)
      const brandsInGroup = Array.from(new Set(g.items.map(it => it.brand)))
      const totalQty = g.items.reduce((s, it) => s + Number(it.qty), 0)
      const totalAmount = g.items.reduce((s, it) => s + it.qty * it.unit_cost, 0)
      return {
        entity_code: g.entity_code,
        entity_name: entity?.legal_name || g.entity_code,
        po_type: g.po_type,
        brands: brandsInGroup,
        supplier_code: g.supplier_code,
        supplier_name: supplierName(g.supplier_code),
        total_qty: totalQty,
        total_amount: totalAmount,
        terms,
        drafted_by,
        expected_date: expected_date || null,
        notes: notes || null,
        items: g.items.map(it => ({
          brand: it.brand,
          sku: it.sku,
          product_name: it.product_name,
          qty: it.qty,
          uom: it.uom,
          unit_cost: it.unit_cost,
          amount: it.qty * it.unit_cost,
          reason: it.reason,
          notes: it.parent_sku ? `Component for ${it.parent_sku}` : null,
        })),
      }
    })

    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pos }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      router.refresh()
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const fgCount = items.filter(it => it.po_type === 'FG').length
  const pkgCount = items.filter(it => it.po_type === 'Packaging').length

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          maxWidth: '1280px',
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '24px',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex justify-between items-start">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">
              Draft Purchase Orders
            </div>
            <h2 className="text-xl font-medium tracking-tight mt-1">
              {fgCount} FG + {pkgCount} packaging · will create {groups.length} PO{groups.length !== 1 ? 's' : ''}
            </h2>
            <div className="text-[12px] text-[#6B6B6B] mt-0.5">
              Grouped by (Entity × Supplier × Type). Packaging items auto-loaded from BOM.{' '}
              {unassigned.length > 0 && (
                <span className="text-[#C8432C] font-medium">
                  {unassigned.length} item(s) need supplier ↓
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-[#6B6B6B] hover:text-black text-xl leading-none">
            ×
          </button>
        </div>

        {/* Shared fields */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Field label="Drafted by">
            <select
              value={drafted_by}
              onChange={e => setDraftedBy(e.target.value)}
              className="w-full px-3 py-2 border border-[#D4D0C7] rounded text-[13px] bg-white"
            >
              <option>Grace</option>
              <option>Jun Ye</option>
              <option>Syuen</option>
            </select>
          </Field>
          <Field label="Terms (applies to all)">
            <select
              value={terms}
              onChange={e => setTerms(e.target.value)}
              className="w-full px-3 py-2 border border-[#D4D0C7] rounded text-[13px] bg-white"
            >
              <option>CASH</option>
              <option>Net 30 days</option>
              <option>Net 60 days</option>
              <option>50% Deposit; 50% Delivery</option>
              <option>30% Deposit; 70% Delivery</option>
            </select>
          </Field>
          <Field label="Expected date (applies to all)">
            <input
              type="date"
              value={expected_date}
              onChange={e => setExpectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-[#D4D0C7] rounded text-[13px]"
            />
          </Field>
        </div>

        {/* Items editor */}
        <div className="border border-[#D4D0C7] rounded overflow-hidden mb-4">
          <table className="w-full text-[12px]">
            <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
                <th className="px-2 py-2">SKU / Code</th>
                <th className="px-2 py-2">Description</th>
                <th className="px-2 py-2">Brand</th>
                <th className="px-2 py-2">Entity</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Supplier *</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2">UOM</th>
                <th className="px-2 py-2 text-right">Unit</th>
                <th className="px-2 py-2 text-right">Amount</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => {
                const entity = brandToEntity(it.brand)
                const rowBad = !it.supplier_code || !entity
                const isChild = !!it.parent_sku
                return (
                  <tr
                    key={it.rowKey}
                    className={`border-b border-[#F0EDE4] ${rowBad ? 'bg-[#FFF8F5]' : isChild ? 'bg-[#FAFAF7]' : ''}`}
                  >
                    <td className="px-2 py-2 font-mono text-[#C8432C] align-top">
                      {isChild && <span className="text-[#6B6B6B] mr-1">└</span>}
                      {it.sku}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <div className={isChild ? 'text-[#6B6B6B]' : ''}>{it.product_name}</div>
                      <div className="text-[10px] text-[#6B6B6B] italic">{it.reason}</div>
                    </td>
                    <td className="px-2 py-2 align-top">{it.brand}</td>
                    <td className="px-2 py-2 align-top font-mono text-[11px]">
                      {entity || <span className="text-[#C8432C]">?</span>}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider ${it.po_type === 'FG' ? 'bg-[#F5DEDA] text-[#A53025]' : 'bg-[#DDE7F0] text-[#2C5282]'}`}>
                        {it.po_type}
                      </span>
                    </td>
                    <td className="px-2 py-2 align-top">
                      <span className="sensitive inline-block">
                        <select
                          value={it.supplier_code}
                          onChange={e => updateItem(it.rowKey, { supplier_code: e.target.value })}
                          className={`min-w-[160px] px-1 py-1 border rounded text-[11px] bg-white ${
                            rowBad ? 'border-[#C8432C]' : 'border-[#D4D0C7]'
                          }`}
                        >
                          <option value="">— select —</option>
                          {suppliers.map(s => (
                            <option key={s.supplier_code} value={s.supplier_code}>
                              {s.supplier_name}
                            </option>
                          ))}
                        </select>
                      </span>
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input
                        type="number"
                        value={it.qty}
                        onChange={e => updateItem(it.rowKey, { qty: Number(e.target.value) })}
                        className="w-24 px-1 py-1 border border-[#D4D0C7] rounded text-right text-[12px]"
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <select
                        value={it.uom}
                        onChange={e => updateItem(it.rowKey, { uom: e.target.value })}
                        className="px-1 py-1 border border-[#D4D0C7] rounded text-[11px] bg-white"
                      >
                        <option>BTL</option>
                        <option>BOX</option>
                        <option>Tub</option>
                        <option>Sachet</option>
                        <option>Pack</option>
                        <option>Carton</option>
                        <option>Unit</option>
                        <option>Roll</option>
                        <option>Bottle</option>
                        <option>Label</option>
                        <option>Foil</option>
                        <option>Others</option>
                      </select>
                    </td>
                    <td className="px-2 py-2 align-top">
                      <span className="sensitive inline-block">
                        <input
                          type="number"
                          step="0.01"
                          value={it.unit_cost}
                          onChange={e => updateItem(it.rowKey, { unit_cost: Number(e.target.value) })}
                          className="w-20 px-1 py-1 border border-[#D4D0C7] rounded text-right text-[12px]"
                        />
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono align-top">
                      <span className="sensitive">
                        {(it.qty * it.unit_cost).toLocaleString('en-MY', {
                          minimumFractionDigits: 3, maximumFractionDigits: 3,
                        })}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right align-top">
                      <button
                        onClick={() => removeItem(it.rowKey)}
                        className="text-[#6B6B6B] hover:text-[#C8432C] text-[16px]"
                        title="Remove"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Preview */}
        {groups.length > 0 && (
          <div className="border border-[#D4D0C7] bg-[#FAFAF7] rounded p-3 mb-4">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-2">
              Preview · {groups.length} PO{groups.length !== 1 ? 's' : ''} will be created
            </div>
            <div className="space-y-1.5">
              {groups.map(g => {
                const totalAmt = g.items.reduce((s, it) => s + it.qty * it.unit_cost, 0)
                const brandsList = Array.from(new Set(g.items.map(it => it.brand))).join(' + ')
                return (
                  <div key={g.key} className="text-[12px] flex justify-between gap-3">
                    <span>
                      <span className="font-mono text-[10px] bg-[#EDEAE2] px-1.5 py-0.5 rounded uppercase tracking-wider mr-1.5">
                        {g.entity_code} · {g.po_type}
                      </span>
                      <strong><span className="sensitive">{supplierName(g.supplier_code)}</span></strong>
                      <span className="text-[#6B6B6B]"> · {brandsList} · {g.items.length} item{g.items.length !== 1 ? 's' : ''}</span>
                    </span>
                    <span className="font-mono">
                      <span className="sensitive">RM {totalAmt.toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <Field label="Notes (applies to all POs)">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-[#D4D0C7] rounded text-[13px]"
            placeholder="Optional..."
          />
        </Field>

        {error && (
          <div className="mt-3 p-2.5 bg-[#F5DEDA] border border-[#A53025] rounded text-[12px] text-[#A53025]">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-[#D4D0C7]">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 border border-[#D4D0C7] rounded text-[13px] hover:bg-[#FAFAF7]"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || items.length === 0 || unassigned.length > 0}
            className="px-4 py-2 bg-[#1A1A1A] text-white rounded text-[13px] hover:bg-black disabled:opacity-50"
          >
            {submitting
              ? 'Submitting...'
              : `Submit ${groups.length} PO${groups.length !== 1 ? 's' : ''} for Approval`}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider font-mono text-[#6B6B6B] mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}
