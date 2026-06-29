'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const initialForm = {
  sku: '',
  product_name: '',
  brand: '',
  oem_supplier_code: '',
  billing_supplier_code: '',
  spec: '',
  size: '',
  unit_cost: '',
  selling_price: '',
  safety_stock_qty: '',
  moq: '',
  lead_time_days: '',
  qty_per_carton: '',
  cartons_per_pallet: '',
  unit_weight_g: '',
  unit_dims: '',
  carton_weight_kg: '',
  barcode: '',
  inner_barcode: '',
  hs_code: '',
  country_of_origin: '',
  shelf_life_months: '',
  min_acceptable_shelf_life_days: '',
  storage_conditions: '',
  product_status: 'active',
  launch_date: '',
  primary_image_url: '',
  kkm_reg_no: '',
}

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

export function CreateProductButton({ suppliers }: { suppliers: any[] }) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(initialForm)
  const router = useRouter()

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const update = (key: string, value: string) => setForm({ ...form, [key]: value })

  async function submit() {
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setOpen(false); setForm(initialForm); router.refresh()
    } catch (e: any) { setError(e.message) }
    finally { setSubmitting(false) }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-[#1A1A1A] text-[#FAFAF7] px-3.5 py-2 rounded text-[13px] hover:bg-[#C8432C] transition-colors"
      >
        + New Product
      </button>

      {open && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', boxSizing: 'border-box' }}
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            style={{ backgroundColor: 'white', borderRadius: '8px', width: '100%', maxWidth: '780px', maxHeight: 'calc(100vh - 48px)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '20px 40px', borderBottom: '1px solid #D4D0C7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ ...labelStyle, marginBottom: '2px' }}>New product</div>
                <h2 style={{ fontSize: '22px', fontWeight: 500, margin: 0 }}>Create product</h2>
              </div>
              <button onClick={() => setOpen(false)} style={{ fontSize: '26px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>×</button>
            </div>

            <div style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1 }}>
              <div style={sectionStyle}>Identity</div>
              <Field label="SKU * (case-sensitive — type exactly as it appears)">
                <input value={form.sku} onChange={e => update('sku', e.target.value)} style={inputStyle} placeholder="e.g. N-DH-OAT-15s, kingwell-12s, TPD-Cream30g" />
              </Field>
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
              <Field label="Size"><input value={form.size} onChange={e => update('size', e.target.value)} style={inputStyle} placeholder="e.g. 30 sachets" /></Field>
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
              <Field label="Barcode"><input value={form.barcode} onChange={e => update('barcode', e.target.value)} style={inputStyle} placeholder="13-digit EAN" /></Field>
              <Field label="Inner Barcode"><input value={form.inner_barcode} onChange={e => update('inner_barcode', e.target.value)} style={inputStyle} /></Field>
              <Field label="HS Code"><input value={form.hs_code} onChange={e => update('hs_code', e.target.value)} style={inputStyle} /></Field>
              <Field label="Country of Origin"><input value={form.country_of_origin} onChange={e => update('country_of_origin', e.target.value)} style={inputStyle} placeholder="e.g. Malaysia" /></Field>
              <Field label="KKM Reg No"><input value={form.kkm_reg_no} onChange={e => update('kkm_reg_no', e.target.value)} style={inputStyle} /></Field>

              <div style={sectionStyle}>Shelf Life</div>
              <Field label="Shelf Life (months)"><input type="number" value={form.shelf_life_months} onChange={e => update('shelf_life_months', e.target.value)} style={inputStyle} /></Field>
              <Field label="Min Pharmacy Days"><input type="number" value={form.min_acceptable_shelf_life_days} onChange={e => update('min_acceptable_shelf_life_days', e.target.value)} style={inputStyle} placeholder="default 180" /></Field>
              <Field label="Storage Conditions"><input value={form.storage_conditions} onChange={e => update('storage_conditions', e.target.value)} style={inputStyle} /></Field>

              <div style={sectionStyle}>Image</div>
              <Field label="Primary Image URL"><input value={form.primary_image_url} onChange={e => update('primary_image_url', e.target.value)} style={inputStyle} /></Field>

              {error && (
                <div style={{ padding: '12px', backgroundColor: '#F5DEDA', border: '1px solid #A53025', borderRadius: '4px', color: '#A53025', fontSize: '13px' }}>{error}</div>
              )}
            </div>

            <div style={{ padding: '16px 40px', borderTop: '1px solid #D4D0C7', display: 'flex', justifyContent: 'flex-end', gap: '8px', flexShrink: 0 }}>
              <button onClick={() => setOpen(false)} disabled={submitting} style={{ padding: '8px 14px', borderRadius: '4px', fontSize: '13px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button
                onClick={submit}
                disabled={submitting || !form.sku || !form.product_name}
                style={{ padding: '8px 18px', borderRadius: '4px', fontSize: '13px', backgroundColor: '#1A1A1A', color: '#FAFAF7', border: 'none', cursor: 'pointer', opacity: (submitting || !form.sku || !form.product_name) ? 0.5 : 1 }}
              >
                {submitting ? 'Creating...' : 'Create Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={labelStyle}>{label}</label>{children}</div>
}