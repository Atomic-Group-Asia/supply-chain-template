'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'

type Supplier = { supplier_code: string; supplier_name: string }
type Entity = { code: string; legal_name: string; brands: string[] }

// Catalog row used for auto-fill in line items. Comes from either
// products table (FG) or packaging table (Packaging) depending on po_type.
export type CatalogItem = {
  sku: string
  brand: string
  product_name: string
  unit_cost: number | null
  uom: string | null
}

type LineItem = {
  brand: string
  sku: string
  product_name: string
  qty: number
  uom: string
  unit_cost: number
  notes: string
  expected_date: string  // per-line ETA; falls back to PO header when empty
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 10px', border: '1px solid #D4D0C7',
  borderRadius: '4px', fontSize: '12px', backgroundColor: 'white',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-jetbrains-mono), monospace',
  fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em',
  color: '#6B6B6B', marginBottom: '4px', fontWeight: 600,
}

function newLine(): LineItem {
  return { brand: '', sku: '', product_name: '', qty: 0, uom: 'pc', unit_cost: 0, notes: '', expected_date: '' }
}

export function CreateManualPOModal({
  suppliers, entities, products, packaging, onClose,
}: {
  suppliers: Supplier[]
  entities: Entity[]
  products: CatalogItem[]   // FG catalog
  packaging: CatalogItem[]  // Packaging catalog
  onClose: () => void
}) {
  const router = useRouter()
  const [entity_code, setEntityCode] = useState<string>(entities[0]?.code || '')
  const [po_type, setPoType] = useState<'FG' | 'Packaging'>('FG')
  const [po_number_override, setPoNumberOverride] = useState<string>('')
  const [supplier_code, setSupplierCode] = useState<string>('')
  const [drafted_by, setDraftedBy] = useState<string>('Jun Ye')
  const [terms, setTerms] = useState<string>('Net 30 days')
  const [expected_date, setExpectedDate] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [items, setItems] = useState<LineItem[]>([newLine()])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const entity = entities.find(e => e.code === entity_code)
  const supplier = suppliers.find(s => s.supplier_code === supplier_code)
  const totalQty = items.reduce((s, it) => s + (Number(it.qty) || 0), 0)
  const totalAmount = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.unit_cost) || 0), 0)

  // Active catalog depends on PO type (FG → products, Packaging → packaging master)
  const catalog: CatalogItem[] = po_type === 'FG' ? products : packaging

  // All brands present in the active catalog (Brand picker shows these)
  const catalogBrands = useMemo(() => {
    const set = new Set<string>()
    for (const p of catalog) if (p.brand) set.add(p.brand)
    return Array.from(set).sort()
  }, [catalog])

  // SKUs available for the active catalog, indexed by sku for fast autofill lookup
  const catalogBySku = useMemo(() => {
    const m = new Map<string, CatalogItem>()
    for (const p of catalog) m.set(p.sku, p)
    return m
  }, [catalog])

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it))
  }

  // When user picks a SKU from the datalist, auto-fill name / uom / unit_cost
  function onSkuChange(idx: number, sku: string) {
    const found = catalogBySku.get(sku.trim())
    if (found) {
      updateItem(idx, {
        sku: found.sku,
        brand: found.brand || items[idx].brand,
        product_name: found.product_name,
        uom: found.uom || items[idx].uom || 'pc',
        unit_cost: found.unit_cost ?? items[idx].unit_cost ?? 0,
      })
    } else {
      // No match — keep what's typed so they can still enter ad-hoc SKUs
      updateItem(idx, { sku })
    }
  }
  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }
  function addItem() {
    setItems(prev => [...prev, newLine()])
  }

  function validate(): string | null {
    if (!entity_code || !entity) return 'Pick a buyer entity'
    if (!supplier_code || !supplier) return 'Pick a supplier'
    if (items.length === 0) return 'Add at least one line item'
    for (const it of items) {
      if (!it.brand) return 'Each line needs a brand'
      if (!it.product_name && !it.sku) return 'Each line needs a product name or SKU'
      if (!it.qty || it.qty <= 0) return 'Each line needs a positive qty'
    }
    return null
  }

  async function save() {
    const err = validate()
    if (err) { setError(err); return }
    setSubmitting(true); setError(null)
    try {
      // Collect unique brands across items
      const brandSet = new Set(items.map(it => it.brand).filter(Boolean))
      const brands = Array.from(brandSet)

      const payload = {
        pos: [{
          entity_code,
          entity_name: entity!.legal_name,
          po_type,
          po_number: po_number_override.trim() || undefined,
          brands,
          supplier_code,
          supplier_name: supplier!.supplier_name,
          total_qty: totalQty,
          total_amount: totalAmount,
          terms: terms || null,
          drafted_by,
          expected_date: expected_date || null,
          notes: notes || null,
          items: items.map(it => ({
            brand: it.brand,
            sku: it.sku || null,
            product_name: it.product_name || it.sku,
            qty: Number(it.qty),
            uom: it.uom || 'pc',
            unit_cost: Number(it.unit_cost) || 0,
            amount: (Number(it.qty) || 0) * (Number(it.unit_cost) || 0),
            reason: 'Manual PO',
            notes: it.notes || null,
            expected_date: it.expected_date || null,
          })),
        }],
      }

      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to create PO'); return }
      const created = data.created?.[0]
      onClose()
      router.refresh()
      if (created?.id) router.push(`/purchase-orders/${created.id}`)
    } catch (e: any) {
      setError(e.message || 'Failed to create PO')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', boxSizing: 'border-box' }}
      onClick={() => !submitting && onClose()}
    >
      <div
        style={{ backgroundColor: 'white', borderRadius: '8px', width: '100%', maxWidth: '1000px', maxHeight: 'calc(100vh - 48px)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 32px', borderBottom: '1px solid #D4D0C7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ ...labelStyle, marginBottom: '2px' }}>Manual PO</div>
            <h2 style={{ fontSize: '20px', fontWeight: 500, margin: 0 }}>Create Purchase Order</h2>
          </div>
          <button onClick={onClose} style={{ fontSize: '24px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>×</button>
        </div>

        <div style={{ padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1 }}>
          {/* Header fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Buyer Entity *</label>
              <select value={entity_code} onChange={e => setEntityCode(e.target.value)} style={inputStyle}>
                <option value="">—</option>
                {entities.map(e => <option key={e.code} value={e.code}>{e.code} · {e.legal_name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>PO Type *</label>
              <select value={po_type} onChange={e => setPoType(e.target.value as 'FG' | 'Packaging')} style={inputStyle}>
                <option value="FG">FG</option>
                <option value="Packaging">Packaging</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Supplier *</label>
              <select value={supplier_code} onChange={e => setSupplierCode(e.target.value)} style={inputStyle}>
                <option value="">—</option>
                {suppliers.map(s => <option key={s.supplier_code} value={s.supplier_code}>{s.supplier_code} · {s.supplier_name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>PO number (optional)</label>
              <input
                value={po_number_override}
                onChange={e => setPoNumberOverride(e.target.value)}
                style={{ ...inputStyle, fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                placeholder="Leave blank → auto-generate"
              />
              <div style={{ fontSize: '10px', color: '#6B6B6B', marginTop: '3px' }}>
                Fill in to key in an existing PO (e.g. NAT-2604-PO021).
              </div>
            </div>
            <div>
              <label style={labelStyle}>Drafted by</label>
              <input value={drafted_by} onChange={e => setDraftedBy(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Expected date</label>
              <input type="date" value={expected_date} onChange={e => setExpectedDate(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Terms</label>
              <input value={terms} onChange={e => setTerms(e.target.value)} style={inputStyle} placeholder="Net 30 days" />
            </div>
            <div />
          </div>

          {/* Line items */}
          <div style={{ marginTop: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={labelStyle}>Line Items</div>
              <button onClick={addItem} style={{ padding: '4px 10px', fontSize: '11px', border: '1px solid #D4D0C7', borderRadius: '4px', background: 'white', cursor: 'pointer' }}>+ Add line</button>
            </div>
            <div style={{ border: '1px solid #E8E5DE', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '100px 140px 1fr 70px 60px 90px 110px 90px 24px', gap: '6px', padding: '6px 10px', backgroundColor: '#FAFAF7', borderBottom: '1px solid #E8E5DE', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B6B6B', fontWeight: 600 }}>
                <div>Brand</div>
                <div>SKU</div>
                <div>Product name</div>
                <div>Qty</div>
                <div>UOM</div>
                <div>Unit cost</div>
                <div style={{ textAlign: 'right' }}>Amount</div>
                <div title="Per-line ETA (falls back to PO header if blank)">Line ETA</div>
                <div></div>
              </div>
              {items.map((it, i) => {
                const amount = (Number(it.qty) || 0) * (Number(it.unit_cost) || 0)
                const skuListId = `sku-list-${i}`
                // Scope SKU suggestions to selected brand (if any).
                const skuOptions = catalog.filter(p => !it.brand || p.brand === it.brand)
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '100px 140px 1fr 70px 60px 90px 110px 90px 24px', gap: '6px', padding: '6px 10px', borderBottom: '1px solid #F0EDE4', alignItems: 'center' }}>
                    <select
                      value={it.brand}
                      onChange={e => updateItem(i, { brand: e.target.value, sku: '', product_name: '', uom: '', unit_cost: 0 })}
                      style={inputStyle}
                    >
                      <option value="">— Brand</option>
                      {catalogBrands.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <input
                      value={it.sku}
                      onChange={e => onSkuChange(i, e.target.value)}
                      style={{ ...inputStyle, fontFamily: 'var(--font-jetbrains-mono), monospace' }}
                      placeholder={it.brand ? 'Type / pick SKU' : 'Pick brand first'}
                      list={skuListId}
                      disabled={!it.brand}
                    />
                    <datalist id={skuListId}>
                      {skuOptions.map(p => (
                        <option key={p.sku} value={p.sku}>{p.product_name}</option>
                      ))}
                    </datalist>
                    <input value={it.product_name} onChange={e => updateItem(i, { product_name: e.target.value })} style={inputStyle} placeholder="auto-filled" />
                    <input type="number" value={it.qty || ''} onChange={e => updateItem(i, { qty: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, textAlign: 'right' }} />
                    <input value={it.uom} onChange={e => updateItem(i, { uom: e.target.value })} style={inputStyle} placeholder="pc" list="uom-list" />
                    <input type="number" step="0.001" value={it.unit_cost || ''} onChange={e => updateItem(i, { unit_cost: parseFloat(e.target.value) || 0 })} style={{ ...inputStyle, textAlign: 'right' }} />
                    <div style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '12px', textAlign: 'right' }}>
                      {amount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <input
                      type="date"
                      value={it.expected_date}
                      onChange={e => updateItem(i, { expected_date: e.target.value })}
                      style={{ ...inputStyle, fontSize: '11px' }}
                      title="Leave blank to use PO header ETA"
                    />
                    <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#A53025', fontSize: '14px' }} title="Remove">×</button>
                  </div>
                )
              })}
              <datalist id="uom-list">
                <option value="pc" /><option value="Roll" /><option value="Pack" /><option value="Box" /><option value="Carton" /><option value="Bottle" /><option value="Set" />
              </datalist>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '24px', marginTop: '10px', fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '12px' }}>
              <div>Total qty: <strong>{totalQty.toLocaleString()}</strong></div>
              <div>Total amount: <strong className="sensitive">RM {totalAmount.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} />
          </div>

          {error && (
            <div style={{ padding: '10px', backgroundColor: '#F5DEDA', border: '1px solid #A53025', borderRadius: '4px', color: '#A53025', fontSize: '12px' }}>{error}</div>
          )}
        </div>

        <div style={{ padding: '14px 32px', borderTop: '1px solid #D4D0C7', display: 'flex', justifyContent: 'flex-end', gap: '8px', flexShrink: 0 }}>
          <button onClick={onClose} disabled={submitting} style={{ padding: '8px 14px', borderRadius: '4px', fontSize: '13px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
          <button onClick={save} disabled={submitting} style={{ padding: '8px 18px', borderRadius: '4px', fontSize: '13px', backgroundColor: '#1A1A1A', color: '#FAFAF7', border: 'none', cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}>
            {submitting ? 'Creating…' : 'Create PO'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function CreateManualPOButton({
  suppliers, entities, products, packaging, className,
}: {
  suppliers: Supplier[]
  entities: Entity[]
  products: CatalogItem[]
  packaging: CatalogItem[]
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className || 'text-[12px] text-[#6B6B6B] hover:text-[#1A1A1A] underline underline-offset-2'}
      >
        + Manual PO
      </button>
      {open && (
        <CreateManualPOModal
          suppliers={suppliers}
          entities={entities}
          products={products}
          packaging={packaging}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
