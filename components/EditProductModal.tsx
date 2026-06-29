'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid #D4D0C7',
  borderRadius: '4px', fontSize: '13px', backgroundColor: 'white',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontFamily: 'var(--font-jetbrains-mono), monospace',
  fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em',
  color: '#6B6B6B', marginBottom: '6px', fontWeight: 600,
}
const sectionStyle: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '10px',
  textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B6B6B',
  paddingTop: '16px', marginTop: '8px', borderTop: '1px solid #E8E5DE',
  fontWeight: 600,
}

export function EditProductModal({
  product,
  suppliers,
  onClose,
  bomLines,
  packaging,
}: {
  product: any
  suppliers: any[]
  onClose: () => void
  bomLines?: any[]
  packaging?: any[]
}) {
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    product_name: product.product_name || '',
    brand: product.brand || '',
    oem_supplier_code: product.oem_supplier_code || '',
    billing_supplier_code: product.billing_supplier_code || '',
    spec: product.spec || '',
    size: product.size || '',
    unit_cost: product.unit_cost ?? '',
    selling_price: product.selling_price ?? '',
    safety_stock_qty: product.safety_stock_qty ?? '',
    moq: product.moq ?? '',
    lead_time_days: product.lead_time_days ?? '',
    qty_per_carton: product.qty_per_carton ?? '',
    cartons_per_pallet: product.cartons_per_pallet ?? '',
    unit_weight_g: product.unit_weight_g ?? '',
    unit_dims: product.unit_dims || '',
    carton_weight_kg: product.carton_weight_kg ?? '',
    barcode: product.barcode || '',
    inner_barcode: product.inner_barcode || '',
    hs_code: product.hs_code || '',
    country_of_origin: product.country_of_origin || '',
    shelf_life_months: product.shelf_life_months ?? '',
    min_acceptable_shelf_life_days: product.min_acceptable_shelf_life_days ?? '',
    storage_conditions: product.storage_conditions || '',
    product_status: product.product_status || 'active',
    launch_date: product.launch_date || '',
    primary_image_url: product.primary_image_url || '',
    kkm_reg_no: product.kkm_reg_no || '',
  })
  const router = useRouter()

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const update = (key: string, value: string) => setForm({ ...form, [key]: value })

  async function save() {
    setSubmitting(true); setError('')
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(product.sku)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      onClose(); router.refresh()
    } catch (e: any) { setError(e.message) } finally { setSubmitting(false) }
  }

  async function remove() {
    if (!confirm(`Delete ${product.sku} (${product.product_name})?`)) return
    setDeleting(true); setError('')
    try {
      const res = await fetch(`/api/products/${encodeURIComponent(product.sku)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      onClose(); router.refresh()
    } catch (e: any) { setError(e.message) } finally { setDeleting(false) }
  }

  return (
    <div
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', boxSizing: 'border-box' }}
      onClick={() => !submitting && !deleting && onClose()}
    >
      <div
        style={{ backgroundColor: 'white', borderRadius: '8px', width: '100%', maxWidth: '780px', maxHeight: 'calc(100vh - 48px)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 40px', borderBottom: '1px solid #D4D0C7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ ...labelStyle, marginBottom: '2px' }}>{product.sku}</div>
            <h2 style={{ fontSize: '22px', fontWeight: 500, margin: 0 }}>Edit product</h2>
          </div>
          <button onClick={onClose} style={{ fontSize: '26px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>×</button>
        </div>

        <div style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1 }}>
          <div style={sectionStyle}>Identity</div>
          <Field label="Name *"><input value={form.product_name} onChange={e => update('product_name', e.target.value)} style={inputStyle} /></Field>
          <Field label="Brand">
            <select value={form.brand} onChange={e => update('brand', e.target.value)} style={inputStyle}>
              <option value="">—</option>
              <option>Nattome</option><option>Heartio</option><option>Gluco</option>
              <option>TPD</option><option>Stonecare</option><option>HooHoo</option>
            </select>
          </Field>
          <Field label="Status">
            <select value={form.product_status} onChange={e => update('product_status', e.target.value)} style={inputStyle}>
              <option>development</option><option>active</option><option>phasing_out</option><option>discontinued</option><option>suspended</option>
            </select>
          </Field>
          <Field label="Launch Date"><input type="date" value={form.launch_date} onChange={e => update('launch_date', e.target.value)} style={inputStyle} /></Field>

          <div style={sectionStyle}>Suppliers</div>
          <Field label="OEM (who makes it)">
            <select value={form.oem_supplier_code} onChange={e => update('oem_supplier_code', e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {suppliers.map(s => <option key={s.supplier_code} value={s.supplier_code}>{s.supplier_code} · {s.supplier_name}</option>)}
            </select>
          </Field>
          <Field label="Billing (who invoices)">
            <select value={form.billing_supplier_code} onChange={e => update('billing_supplier_code', e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {suppliers.map(s => <option key={s.supplier_code} value={s.supplier_code}>{s.supplier_code} · {s.supplier_name}</option>)}
            </select>
          </Field>

          <div style={sectionStyle}>Spec & Pricing</div>
          <Field label="Spec"><input value={form.spec} onChange={e => update('spec', e.target.value)} style={inputStyle} /></Field>
          <Field label="Size"><input value={form.size} onChange={e => update('size', e.target.value)} style={inputStyle} /></Field>
          <Field label="Unit Cost (RM)"><input type="number" step="0.001" value={form.unit_cost} onChange={e => update('unit_cost', e.target.value)} style={inputStyle} /></Field>
          <Field label="Selling Price (RM)"><input type="number" step="0.01" value={form.selling_price} onChange={e => update('selling_price', e.target.value)} style={inputStyle} /></Field>

          <div style={sectionStyle}>Operations</div>
          <Field label="Safety Stock"><input type="number" value={form.safety_stock_qty} onChange={e => update('safety_stock_qty', e.target.value)} style={inputStyle} /></Field>
          <Field label="MOQ"><input type="number" value={form.moq} onChange={e => update('moq', e.target.value)} style={inputStyle} /></Field>
          <Field label="Lead Time (days)"><input type="number" value={form.lead_time_days} onChange={e => update('lead_time_days', e.target.value)} style={inputStyle} /></Field>
          <Field label="Qty per Carton"><input type="number" value={form.qty_per_carton} onChange={e => update('qty_per_carton', e.target.value)} style={inputStyle} /></Field>
          <Field label="Cartons per Pallet"><input type="number" value={form.cartons_per_pallet} onChange={e => update('cartons_per_pallet', e.target.value)} style={inputStyle} /></Field>

          <div style={sectionStyle}>Physical</div>
          <Field label="Unit Weight (g)"><input type="number" step="0.01" value={form.unit_weight_g} onChange={e => update('unit_weight_g', e.target.value)} style={inputStyle} /></Field>
          <Field label="Unit Dimensions (LxWxH cm)"><input value={form.unit_dims} onChange={e => update('unit_dims', e.target.value)} style={inputStyle} /></Field>
          <Field label="Carton Weight (kg)"><input type="number" step="0.01" value={form.carton_weight_kg} onChange={e => update('carton_weight_kg', e.target.value)} style={inputStyle} /></Field>

          <div style={sectionStyle}>Codes & Compliance</div>
          <Field label="Barcode"><input value={form.barcode} onChange={e => update('barcode', e.target.value)} style={inputStyle} /></Field>
          <Field label="Inner Barcode"><input value={form.inner_barcode} onChange={e => update('inner_barcode', e.target.value)} style={inputStyle} /></Field>
          <Field label="HS Code"><input value={form.hs_code} onChange={e => update('hs_code', e.target.value)} style={inputStyle} /></Field>
          <Field label="Country of Origin"><input value={form.country_of_origin} onChange={e => update('country_of_origin', e.target.value)} style={inputStyle} /></Field>
          <Field label="KKM Reg No"><input value={form.kkm_reg_no} onChange={e => update('kkm_reg_no', e.target.value)} style={inputStyle} /></Field>

          <div style={sectionStyle}>Shelf Life</div>
          <Field label="Shelf Life (months)"><input type="number" value={form.shelf_life_months} onChange={e => update('shelf_life_months', e.target.value)} style={inputStyle} /></Field>
          <Field label="Min Pharmacy Days"><input type="number" value={form.min_acceptable_shelf_life_days} onChange={e => update('min_acceptable_shelf_life_days', e.target.value)} style={inputStyle} /></Field>
          <Field label="Storage Conditions"><input value={form.storage_conditions} onChange={e => update('storage_conditions', e.target.value)} style={inputStyle} /></Field>

          <div style={sectionStyle}>Image</div>
          <Field label="Primary Image URL"><input value={form.primary_image_url} onChange={e => update('primary_image_url', e.target.value)} style={inputStyle} /></Field>

          <div style={sectionStyle}>BOM Components</div>
          <BomEditor
            sku={product.sku}
            initial={bomLines || []}
            packagingOptions={packaging || []}
            suppliers={suppliers}
          />
          {error && (
            <div style={{ padding: '12px', backgroundColor: '#F5DEDA', border: '1px solid #A53025', borderRadius: '4px', color: '#A53025', fontSize: '13px' }}>{error}</div>
          )}
        </div>

        <div style={{ padding: '16px 40px', borderTop: '1px solid #D4D0C7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button onClick={remove} disabled={submitting || deleting} style={{ padding: '8px 14px', borderRadius: '4px', fontSize: '13px', color: '#A53025', background: 'none', border: '1px solid #A53025', cursor: 'pointer' }}>
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} disabled={submitting || deleting} style={{ padding: '8px 14px', borderRadius: '4px', fontSize: '13px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
            <button onClick={save} disabled={submitting || deleting || !form.product_name} style={{ padding: '8px 18px', borderRadius: '4px', fontSize: '13px', backgroundColor: '#1A1A1A', color: '#FAFAF7', border: 'none', cursor: 'pointer', opacity: (submitting || deleting || !form.product_name) ? 0.5 : 1 }}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>
}

// ─────────────────────────────────────────────────────────────────────
//  BOM editor — inline add / edit / delete for a single product's
//  packaging components. Saves each row independently to the BOM API.
// ─────────────────────────────────────────────────────────────────────

type BomRow = {
  id?: string
  packaging_code: string
  qty_per_unit: number | string
  type?: string | null
  source?: string | null
  notes?: string | null
  // Local UI state
  _dirty?: boolean
  _saving?: boolean
  _err?: string | null
}

function BomEditor({
  sku, initial, packagingOptions, suppliers,
}: {
  sku: string
  initial: any[]
  packagingOptions: any[]
  suppliers: any[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState<BomRow[]>(() => initial.map(r => ({ ...r })))
  const [adding, setAdding] = useState(false)
  const [newRow, setNewRow] = useState<BomRow>({
    packaging_code: '', qty_per_unit: 1, source: '', notes: '',
  })
  const [addError, setAddError] = useState<string | null>(null)

  const pkgMap = new Map(packagingOptions.map(p => [p.packaging_code, p]))

  function patchRow(i: number, patch: Partial<BomRow>) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch, _dirty: true, _err: null } : r))
  }

  async function saveRow(i: number) {
    const r = rows[i]
    if (!r.id) return
    setRows(prev => prev.map((x, idx) => idx === i ? { ...x, _saving: true, _err: null } : x))
    try {
      const res = await fetch(`/api/bom/${r.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qty_per_unit: Number(r.qty_per_unit) || 0,
          source: r.source || null,
          notes: r.notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRows(prev => prev.map((x, idx) => idx === i ? { ...x, _saving: false, _err: data.error || 'Save failed' } : x))
        return
      }
      setRows(prev => prev.map((x, idx) => idx === i ? { ...x, _saving: false, _dirty: false } : x))
      router.refresh()
    } catch (e: any) {
      setRows(prev => prev.map((x, idx) => idx === i ? { ...x, _saving: false, _err: e.message } : x))
    }
  }

  async function deleteRow(i: number) {
    const r = rows[i]
    if (!r.id) return
    if (!confirm(`Remove ${r.packaging_code} from this product's BOM?`)) return
    const res = await fetch(`/api/bom/${r.id}`, { method: 'DELETE' })
    if (res.ok) {
      setRows(prev => prev.filter((_, idx) => idx !== i))
      router.refresh()
    } else {
      alert((await res.json()).error || 'Delete failed')
    }
  }

  async function addNew() {
    setAddError(null)
    if (!newRow.packaging_code) { setAddError('Pick a packaging'); return }
    if (!Number(newRow.qty_per_unit)) { setAddError('Qty must be > 0'); return }
    const res = await fetch('/api/bom', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_sku: sku,
        packaging_code: newRow.packaging_code,
        qty_per_unit: Number(newRow.qty_per_unit),
        source: newRow.source || null,
        notes: newRow.notes || null,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setAddError(data.error || 'Create failed'); return }
    // Bring the newly-created row into local state
    setRows(prev => [...prev, { ...data.bom }])
    setNewRow({ packaging_code: '', qty_per_unit: 1, source: '', notes: '' })
    setAdding(false)
    router.refresh()
  }

  const cellInput: React.CSSProperties = {
    width: '100%', padding: '6px 8px', border: '1px solid #D4D0C7',
    borderRadius: '4px', fontSize: '12px', fontFamily: 'var(--font-jetbrains-mono), monospace',
    backgroundColor: 'white', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div style={{ border: '1px solid #D4D0C7', borderRadius: '4px', overflow: 'hidden' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '180px 80px 80px 160px 1fr 70px',
        gap: '8px', padding: '8px 12px', backgroundColor: '#FAFAF7', borderBottom: '1px solid #D4D0C7',
        fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '9px',
        textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B6B6B', fontWeight: 600,
      }}>
        <div>Packaging</div>
        <div>Type</div>
        <div>Qty/Unit</div>
        <div>Source (Supplier)</div>
        <div>Notes</div>
        <div></div>
      </div>

      {rows.length === 0 && !adding && (
        <div style={{ padding: '20px', textAlign: 'center', fontSize: '12px', color: '#6B6B6B' }}>
          No BOM components for this product yet.
        </div>
      )}

      {rows.map((r, i) => (
        <div
          key={r.id || i}
          style={{
            display: 'grid', gridTemplateColumns: '180px 80px 80px 160px 1fr 70px',
            gap: '8px', padding: '8px 12px', borderTop: '1px solid #E8E5DE',
            alignItems: 'center', backgroundColor: 'white',
          }}
        >
          <div style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '11px', fontWeight: 500 }}>
            {r.packaging_code}
          </div>
          <div>
            {r.type ? <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: '3px', fontSize: '10px', backgroundColor: '#E8E5DE', color: '#3D3D3D' }}>{r.type}</span> : '—'}
          </div>
          <input
            type="number" step="0.0001"
            value={r.qty_per_unit ?? ''}
            onChange={e => patchRow(i, { qty_per_unit: e.target.value })}
            onBlur={() => r._dirty && saveRow(i)}
            style={cellInput}
          />
          <select
            value={r.source || ''}
            onChange={e => patchRow(i, { source: e.target.value })}
            onBlur={() => r._dirty && saveRow(i)}
            style={{ ...cellInput, fontFamily: 'inherit' }}
          >
            <option value="">—</option>
            {suppliers.map(s => <option key={s.supplier_code} value={s.supplier_code}>{s.supplier_code} · {s.supplier_name}</option>)}
          </select>
          <input
            type="text"
            value={r.notes || ''}
            onChange={e => patchRow(i, { notes: e.target.value })}
            onBlur={() => r._dirty && saveRow(i)}
            style={{ ...cellInput, fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'flex-end' }}>
            {r._saving && <span style={{ fontSize: '10px', color: '#6B6B6B' }}>…</span>}
            {r._err && <span title={r._err} style={{ fontSize: '11px', color: '#A53025' }}>!</span>}
            <button
              type="button"
              onClick={() => deleteRow(i)}
              title="Remove"
              style={{ border: 'none', background: 'none', color: '#A53025', cursor: 'pointer', fontSize: '14px', padding: '4px 6px' }}
            >×</button>
          </div>
        </div>
      ))}

      {adding && (
        <div style={{ display: 'grid', gridTemplateColumns: '180px 80px 80px 160px 1fr 70px', gap: '8px', padding: '8px 12px', borderTop: '1px solid #E8E5DE', backgroundColor: '#FAFAF7' }}>
          <select
            value={newRow.packaging_code}
            onChange={e => setNewRow({ ...newRow, packaging_code: e.target.value })}
            style={{ ...cellInput, fontFamily: 'inherit' }}
          >
            <option value="">— Pick packaging —</option>
            {packagingOptions.map(p => (
              <option key={p.packaging_code} value={p.packaging_code}>
                {p.packaging_code} · {p.packaging_name}
              </option>
            ))}
          </select>
          <div style={{ fontSize: '10px', color: '#6B6B6B', alignSelf: 'center' }}>
            {pkgMap.get(newRow.packaging_code)?.packaging_type || '—'}
          </div>
          <input
            type="number" step="0.0001"
            value={newRow.qty_per_unit}
            onChange={e => setNewRow({ ...newRow, qty_per_unit: e.target.value })}
            placeholder="Qty"
            style={cellInput}
          />
          <select
            value={newRow.source || ''}
            onChange={e => setNewRow({ ...newRow, source: e.target.value })}
            style={{ ...cellInput, fontFamily: 'inherit' }}
          >
            <option value="">—</option>
            {suppliers.map(s => <option key={s.supplier_code} value={s.supplier_code}>{s.supplier_code} · {s.supplier_name}</option>)}
          </select>
          <input
            type="text"
            value={newRow.notes || ''}
            onChange={e => setNewRow({ ...newRow, notes: e.target.value })}
            placeholder="Notes"
            style={{ ...cellInput, fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={addNew} style={{ padding: '4px 8px', fontSize: '11px', background: '#1A1A1A', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>Add</button>
            <button type="button" onClick={() => { setAdding(false); setAddError(null) }} style={{ padding: '4px 6px', fontSize: '11px', background: 'none', border: 'none', color: '#6B6B6B', cursor: 'pointer' }}>×</button>
          </div>
        </div>
      )}
      {addError && (
        <div style={{ padding: '6px 12px', backgroundColor: '#F5DEDA', color: '#A53025', fontSize: '11px' }}>{addError}</div>
      )}

      <div style={{ borderTop: '1px solid #E8E5DE', padding: '8px 12px', backgroundColor: 'white' }}>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            style={{ padding: '6px 12px', border: '1px dashed #D4D0C7', borderRadius: '4px', background: 'white', color: '#3D3D3D', cursor: 'pointer', fontSize: '11px', fontFamily: 'var(--font-jetbrains-mono), monospace' }}
          >+ Add BOM line</button>
        )}
      </div>
    </div>
  )
}