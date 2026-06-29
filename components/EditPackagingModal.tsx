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

export function EditPackagingModal({ packaging, suppliers, onClose }: { packaging: any; suppliers: any[]; onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    packaging_name: packaging.packaging_name || '',
    brand: packaging.brand || '',
    packaging_type: packaging.packaging_type || '',
    uom: packaging.uom || '',
    supplier_code: packaging.supplier_code || '',
    source_channel: packaging.source_channel || '',
    unit_cost: packaging.unit_cost ?? '',
    moq: packaging.moq || '',
    lead_time_days: packaging.lead_time_days ?? '',
    notes: packaging.notes || '',
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
      const res = await fetch(`/api/packaging/${encodeURIComponent(packaging.packaging_code)}`, {
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
    if (!confirm(`Delete ${packaging.packaging_code}?`)) return
    setDeleting(true); setError('')
    try {
      const res = await fetch(`/api/packaging/${encodeURIComponent(packaging.packaging_code)}`, { method: 'DELETE' })
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
        style={{ backgroundColor: 'white', borderRadius: '8px', width: '100%', maxWidth: '720px', maxHeight: 'calc(100vh - 48px)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 40px', borderBottom: '1px solid #D4D0C7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ ...labelStyle, marginBottom: '2px' }}>{packaging.packaging_code}</div>
            <h2 style={{ fontSize: '22px', fontWeight: 500, margin: 0 }}>Edit packaging</h2>
          </div>
          <button onClick={onClose} style={{ fontSize: '26px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>×</button>
        </div>

        <div style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1 }}>
          <div style={sectionStyle}>Basic</div>
          <Field label="Name *"><input value={form.packaging_name} onChange={e => update('packaging_name', e.target.value)} style={inputStyle} /></Field>
          <Field label="Brand">
            <select value={form.brand} onChange={e => update('brand', e.target.value)} style={inputStyle}>
              <option value="">— select brand —</option>
              {['Brand A', 'Brand B', 'Brand C'].map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <input value={form.packaging_type} onChange={e => update('packaging_type', e.target.value)} style={inputStyle} placeholder="Box / Bottle / Foil / Label / Sachet / Others / ..." list="pkg-types" />
            <datalist id="pkg-types">
              <option value="Box" /><option value="Bottle" /><option value="Foil" /><option value="Label" /><option value="Sachet" /><option value="Others" />
            </datalist>
          </Field>
          <Field label="UOM">
            <input value={form.uom} onChange={e => update('uom', e.target.value)} style={inputStyle} placeholder="pc / Roll / Pack / Box / ..." list="pkg-uoms" />
            <datalist id="pkg-uoms">
              <option value="pc" /><option value="Roll" /><option value="Pack" /><option value="Box" /><option value="Carton" />
            </datalist>
          </Field>

          <div style={sectionStyle}>Source</div>
          <Field label="Supplier">
            <select value={form.supplier_code} onChange={e => update('supplier_code', e.target.value)} style={inputStyle}>
              <option value="">—</option>
              {suppliers.map(s => <option key={s.supplier_code} value={s.supplier_code}>{s.supplier_code} · {s.supplier_name}</option>)}
            </select>
          </Field>
          <Field label="Source Channel">
            <input value={form.source_channel} onChange={e => update('source_channel', e.target.value)} style={inputStyle} placeholder="direct_supplier / via_darren / ..." list="src-channels" />
            <datalist id="src-channels">
              <option value="direct_supplier" /><option value="via_darren" />
            </datalist>
          </Field>

          <div style={sectionStyle}>Cost & Ordering</div>
          <Field label="Unit Cost (RM)"><input type="number" step="0.01" value={form.unit_cost} onChange={e => update('unit_cost', e.target.value)} style={inputStyle} /></Field>
          <Field label="MOQ"><input value={form.moq} onChange={e => update('moq', e.target.value)} style={inputStyle} placeholder="e.g. 3000 or 25 rolls" /></Field>
          <Field label="Lead Time (days)"><input type="number" value={form.lead_time_days} onChange={e => update('lead_time_days', e.target.value)} style={inputStyle} /></Field>

          <div style={sectionStyle}>Notes</div>
          <textarea value={form.notes} onChange={e => update('notes', e.target.value)} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />

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
            <button onClick={save} disabled={submitting || deleting || !form.packaging_name} style={{ padding: '8px 18px', borderRadius: '4px', fontSize: '13px', backgroundColor: '#1A1A1A', color: '#FAFAF7', border: 'none', cursor: 'pointer', opacity: (submitting || deleting || !form.packaging_name) ? 0.5 : 1 }}>
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