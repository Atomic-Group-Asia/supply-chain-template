'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const initialForm = {
  product_sku: '',
  packaging_code: '',
  qty_per_unit: '1',
  source: '',
  notes: '',
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

export function CreateBOMButton({ products, packaging, suppliers }: { products: any[]; packaging: any[]; suppliers: any[] }) {
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
      const res = await fetch('/api/bom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, qty_per_unit: parseFloat(form.qty_per_unit) }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setOpen(false); setForm(initialForm); router.refresh()
    } catch (e: any) { setError(e.message) } finally { setSubmitting(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="bg-[#1A1A1A] text-[#FAFAF7] px-3.5 py-2 rounded text-[13px] hover:bg-[#C8432C] transition-colors">+ New BOM Entry</button>

      {open && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', boxSizing: 'border-box' }}
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            style={{ backgroundColor: 'white', borderRadius: '8px', width: '100%', maxWidth: '640px', maxHeight: 'calc(100vh - 48px)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '20px 40px', borderBottom: '1px solid #D4D0C7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <div style={{ ...labelStyle, marginBottom: '2px' }}>New BOM line</div>
                <h2 style={{ fontSize: '22px', fontWeight: 500, margin: 0 }}>Create BOM entry</h2>
              </div>
              <button onClick={() => setOpen(false)} style={{ fontSize: '26px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>×</button>
            </div>

            <div style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1 }}>
              <div style={sectionStyle}>Product → Packaging</div>
              <Field label="Product SKU *">
                <select value={form.product_sku} onChange={e => update('product_sku', e.target.value)} style={inputStyle}>
                  <option value="">—</option>
                  {products.map(p => <option key={p.sku} value={p.sku}>{p.sku} · {p.product_name}</option>)}
                </select>
              </Field>
              <Field label="Packaging *">
                <select value={form.packaging_code} onChange={e => update('packaging_code', e.target.value)} style={inputStyle}>
                  <option value="">—</option>
                  {packaging.map(p => <option key={p.packaging_code} value={p.packaging_code}>{p.packaging_code} · {p.packaging_name}</option>)}
                </select>
              </Field>
              <Field label="Qty per FG unit *">
                <input type="number" step="0.0001" value={form.qty_per_unit} onChange={e => update('qty_per_unit', e.target.value)} style={inputStyle} placeholder="e.g. 1 or 0.0833 (1 carton = 12 units)" />
              </Field>

              <div style={sectionStyle}>Source</div>
              <Field label="Supplier">
                <select value={form.source} onChange={e => update('source', e.target.value)} style={inputStyle}>
                  <option value="">—</option>
                  {suppliers.map(s => <option key={s.supplier_code} value={s.supplier_code}>{s.supplier_code} · {s.supplier_name}</option>)}
                </select>
              </Field>

              <div style={sectionStyle}>Notes</div>
              <textarea value={form.notes} onChange={e => update('notes', e.target.value)} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />

              <div style={{ ...labelStyle, marginTop: '8px', marginBottom: 0 }}>
                Type will auto-fill from selected packaging
              </div>

              {error && (
                <div style={{ padding: '12px', backgroundColor: '#F5DEDA', border: '1px solid #A53025', borderRadius: '4px', color: '#A53025', fontSize: '13px' }}>{error}</div>
              )}
            </div>

            <div style={{ padding: '16px 40px', borderTop: '1px solid #D4D0C7', display: 'flex', justifyContent: 'flex-end', gap: '8px', flexShrink: 0 }}>
              <button onClick={() => setOpen(false)} disabled={submitting} style={{ padding: '8px 14px', borderRadius: '4px', fontSize: '13px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submit} disabled={submitting || !form.product_sku || !form.packaging_code || !form.qty_per_unit} style={{ padding: '8px 18px', borderRadius: '4px', fontSize: '13px', backgroundColor: '#1A1A1A', color: '#FAFAF7', border: 'none', cursor: 'pointer', opacity: (submitting || !form.product_sku || !form.packaging_code || !form.qty_per_unit) ? 0.5 : 1 }}>
                {submitting ? 'Creating...' : 'Create BOM Entry'}
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