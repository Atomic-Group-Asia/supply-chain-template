'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

type Item = {
  id?: string
  brand: string
  sku: string | null
  product_name: string
  qty: number
  uom: string
  unit_cost: number
  reason: string | null
  notes: string | null
  expected_date: string | null   // per-line ETA; null = use PO header
}

type Supplier = { supplier_code: string; supplier_name: string }
type CatalogItem = {
  sku: string
  brand: string
  product_name: string
  unit_cost: number | null
  uom: string | null
}

export function POEditForm({
  po, suppliers, products = [], packaging = [],
}: {
  po: any
  suppliers: Supplier[]
  products?: CatalogItem[]
  packaging?: CatalogItem[]
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [terms, setTerms] = useState<string>(po.terms || 'Net 30 days')
  const [expectedDate, setExpectedDate] = useState<string>(po.expected_date || '')
  const [notes, setNotes] = useState<string>(po.notes || '')
  const [supplierCode, setSupplierCode] = useState<string>(po.supplier_code || '')
  const [poNumber, setPoNumber] = useState<string>(po.po_number || '')

  const [items, setItems] = useState<Item[]>(() =>
    (po.items || []).map((it: any) => ({
      id: it.id,
      brand: it.brand,
      sku: it.sku,
      product_name: it.product_name,
      qty: Number(it.qty),
      uom: it.uom,
      unit_cost: Number(it.unit_cost),
      reason: it.reason,
      notes: it.notes,
      expected_date: it.expected_date || null,
    }))
  )

  // Active catalog by PO type (auto-fill source).
  const catalog: CatalogItem[] = po.po_type === 'Packaging' ? packaging : products
  const catalogBrands = useMemo(() => {
    const set = new Set<string>()
    for (const p of catalog) if (p.brand) set.add(p.brand)
    return Array.from(set).sort()
  }, [catalog])
  const catalogBySku = useMemo(() => {
    const m = new Map<string, CatalogItem>()
    for (const p of catalog) m.set(p.sku, p)
    return m
  }, [catalog])

  function updateItem(idx: number, patch: Partial<Item>) {
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function addItem() {
    setItems(prev => [
      ...prev,
      {
        brand: prev[prev.length - 1]?.brand || '',
        sku: null,
        product_name: '',
        qty: 0,
        uom: prev[prev.length - 1]?.uom || 'Unit',
        unit_cost: 0,
        reason: null,
        notes: null,
        expected_date: null,
      },
    ])
  }

  // When user picks a SKU (typed or selected from datalist), auto-fill
  // product_name, UOM, and unit_cost from the catalog. Non-catalog SKUs
  // are still accepted (manual entry remains possible).
  function onSkuChange(idx: number, sku: string) {
    const found = catalogBySku.get(sku.trim())
    if (found) {
      updateItem(idx, {
        sku: found.sku,
        brand: found.brand || items[idx].brand,
        product_name: found.product_name,
        uom: found.uom || items[idx].uom || 'Unit',
        unit_cost: found.unit_cost ?? items[idx].unit_cost ?? 0,
      })
    } else {
      updateItem(idx, { sku: sku || null })
    }
  }

  const totals = useMemo(() => {
    let qty = 0, amt = 0
    for (const it of items) {
      qty += Number(it.qty || 0)
      amt += Number(it.qty || 0) * Number(it.unit_cost || 0)
    }
    return { qty, amt }
  }, [items])

  const supplierName = suppliers.find(s => s.supplier_code === supplierCode)?.supplier_name || po.supplier_name

  async function handleSave() {
    if (items.length === 0) return setError('At least 1 line item required')
    if (items.some(it => !it.product_name || it.qty <= 0)) return setError('Every line item must have name and qty > 0')
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_full',
          po_number: poNumber.trim() || po.po_number, // never blank — keep original if cleared
          terms,
          expected_date: expectedDate || null,
          notes: notes || null,
          supplier_code: supplierCode || null,
          supplier_name: supplierName,
          items,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Save failed')
      router.push(`/purchase-orders/${po.id}`)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="bg-[#FFF8ED] border border-[#B8860B] rounded p-3 mb-6 flex justify-between items-center">
        <div className="text-[12px] text-[#8B6F1B]">
          <strong>Editing PO</strong> · Changes will recompute totals. PO number, supplier, terms, line items are all editable.
        </div>
        <a
          href={`/purchase-orders/${po.id}`}
          className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[12px] hover:bg-white"
        >
          Cancel
        </a>
      </div>

      {/* PO number — editable for keying in existing/external POs */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Field label="PO Number">
          <input
            type="text"
            value={poNumber}
            onChange={e => setPoNumber(e.target.value)}
            className="w-full px-3 py-2 border border-[#D4D0C7] rounded text-[13px] bg-white font-mono"
            placeholder={po.po_number}
          />
          <div className="text-[10px] text-[#6B6B6B] mt-1 font-mono">
            Original: {po.po_number}
          </div>
        </Field>
        <div />
      </div>

      {/* Header fields */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Field label="Supplier">
          <span className="sensitive inline-block w-full">
            <select
              value={supplierCode}
              onChange={e => setSupplierCode(e.target.value)}
              className="w-full px-3 py-2 border border-[#D4D0C7] rounded text-[13px] bg-white"
            >
              <option value="">— select —</option>
              {suppliers.map(s => (
                <option key={s.supplier_code} value={s.supplier_code}>{s.supplier_name}</option>
              ))}
            </select>
          </span>
        </Field>
        <Field label="Terms">
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
        <Field label="Expected Date">
          <input
            type="date"
            value={expectedDate}
            onChange={e => setExpectedDate(e.target.value)}
            className="w-full px-3 py-2 border border-[#D4D0C7] rounded text-[13px]"
          />
        </Field>
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={1}
            className="w-full px-3 py-2 border border-[#D4D0C7] rounded text-[13px]"
            placeholder="Optional..."
          />
        </Field>
      </div>

      {/* Line items */}
      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden mb-4">
        <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
          <div className="font-medium text-[15px]">Line Items ({items.length})</div>
          <button
            type="button"
            onClick={addItem}
            className="px-3 py-1.5 border border-[#1A1A1A] text-[#1A1A1A] rounded text-[12px] hover:bg-[#1A1A1A] hover:text-white transition-colors font-medium"
          >
            + Add line
          </button>
        </div>
        <table className="w-full text-[12px]">
          <thead className="bg-white border-b border-[#E8E5DE]">
            <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
              <th className="px-3 py-2 w-10">No.</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2">UOM</th>
              <th className="px-3 py-2 text-right">Unit Cost</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2" title="Per-line ETA (falls back to PO header if blank)">Line ETA</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const amount = it.qty * it.unit_cost
              const skuListId = `edit-sku-list-${idx}`
              const skuOptions = catalog.filter(p => !it.brand || p.brand === it.brand)
              return (
                <tr key={it.id || idx} className="border-t border-[#F0EDE4]">
                  <td className="px-3 py-2 text-[#6B6B6B] font-mono">{idx + 1}</td>
                  <td className="px-3 py-2">
                    {catalogBrands.length > 0 ? (
                      <select
                        value={it.brand}
                        onChange={e => updateItem(idx, { brand: e.target.value, sku: null, product_name: '', uom: 'Unit', unit_cost: 0 })}
                        className="w-24 px-2 py-1 border border-[#D4D0C7] rounded text-[12px] bg-white"
                      >
                        <option value="">—</option>
                        {catalogBrands.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={it.brand}
                        onChange={e => updateItem(idx, { brand: e.target.value })}
                        className="w-24 px-2 py-1 border border-[#D4D0C7] rounded text-[12px]"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={it.sku || ''}
                      onChange={e => onSkuChange(idx, e.target.value)}
                      list={skuListId}
                      className="w-36 px-2 py-1 border border-[#D4D0C7] rounded text-[11px] font-mono text-[#C8432C]"
                      placeholder={it.brand ? 'Type / pick SKU' : 'Pick brand first'}
                      disabled={catalog.length > 0 && !it.brand}
                    />
                    <datalist id={skuListId}>
                      {skuOptions.map(p => (
                        <option key={p.sku} value={p.sku}>{p.product_name}</option>
                      ))}
                    </datalist>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={it.product_name}
                      onChange={e => updateItem(idx, { product_name: e.target.value })}
                      className="w-full min-w-[160px] px-2 py-1 border border-[#D4D0C7] rounded text-[12px]"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={it.qty}
                      onChange={e => updateItem(idx, { qty: Number(e.target.value) })}
                      className="w-24 px-2 py-1 border border-[#D4D0C7] rounded text-right text-[12px]"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={it.uom}
                      onChange={e => updateItem(idx, { uom: e.target.value })}
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
                      <option>Each</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="sensitive inline-block">
                      <input
                        type="number"
                        step="0.01"
                        value={it.unit_cost}
                        onChange={e => updateItem(idx, { unit_cost: Number(e.target.value) })}
                        className="w-24 px-2 py-1 border border-[#D4D0C7] rounded text-right text-[12px]"
                      />
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    <span className="sensitive">{amount.toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="date"
                      value={it.expected_date || ''}
                      onChange={e => updateItem(idx, { expected_date: e.target.value || null })}
                      className="px-2 py-1 border border-[#D4D0C7] rounded text-[11px] bg-white"
                      title="Leave blank to use PO header ETA"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => removeItem(idx)}
                      className="text-[#6B6B6B] hover:text-[#C8432C] text-[16px]"
                      title="Remove line"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              )
            })}
            <tr className="bg-[#FAFAF7] font-semibold border-t border-[#D4D0C7]">
              <td colSpan={4} className="px-3 py-2.5 text-right uppercase font-mono text-[10px] tracking-wider">Total</td>
              <td className="px-3 py-2.5 text-right font-mono">{totals.qty.toLocaleString()}</td>
              <td colSpan={2}></td>
              <td className="px-3 py-2.5 text-right font-mono">
                <span className="sensitive">RM {totals.amt.toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      {error && (
        <div className="p-2.5 bg-[#F5DEDA] border border-[#A53025] rounded text-[12px] text-[#A53025] mb-3">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <a
          href={`/purchase-orders/${po.id}`}
          className="px-4 py-2 border border-[#D4D0C7] rounded text-[13px] hover:bg-[#FAFAF7]"
        >
          Cancel
        </a>
        <button
          onClick={handleSave}
          disabled={submitting}
          className="px-4 py-2 bg-[#1A1A1A] text-white rounded text-[13px] hover:bg-black disabled:opacity-50"
        >
          {submitting ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wider font-mono text-[#6B6B6B] mb-1">{label}</label>
      {children}
    </div>
  )
}
