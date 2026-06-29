'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Supplier = any

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

export function EditSupplierModal({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    supplier_name: supplier.supplier_name || '',
    supplier_type: supplier.supplier_type || 'OEM',
    access_model: supplier.access_model || 'Direct',
    payment_terms_fg: supplier.payment_terms_fg || '',
    payment_terms_pkg: supplier.payment_terms_pkg || '',
    primary_contact_name: supplier.primary_contact_name || '',
    primary_contact_email: supplier.primary_contact_email || '',
    primary_contact_phone: supplier.primary_contact_phone || '',
    primary_contact_channel: supplier.primary_contact_channel || 'Whatsapp',
    secondary_contact_name: supplier.secondary_contact_name || '',
    secondary_contact_email: supplier.secondary_contact_email || '',
    secondary_contact_phone: supplier.secondary_contact_phone || '',
    secondary_contact_channel: supplier.secondary_contact_channel || '',
    notes: supplier.notes || '',
  })
  const router = useRouter()

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const update = (key: string, value: string) => setForm({ ...form, [key]: value })

  async function save() {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/suppliers/${supplier.supplier_code}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Unknown error'); return }
      onClose()
      router.refresh()
    } catch (e: any) { setError(e.message) }
    finally { setSubmitting(false) }
  }

  async function remove() {
    if (!confirm(`Delete ${supplier.supplier_code} (${supplier.supplier_name})?`)) return
    setDeleting(true)
    setError('')
    try {
      const res = await fetch(`/api/suppliers/${supplier.supplier_code}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Unknown error'); return }
      onClose()
      router.refresh()
    } catch (e: any) { setError(e.message) }
    finally { setDeleting(false) }
  }

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px', boxSizing: 'border-box',
      }}
      onClick={() => !submitting && !deleting && onClose()}
    >
      <div
        style={{
          backgroundColor: 'white', borderRadius: '8px', width: '100%',
          maxWidth: '720px', maxHeight: 'calc(100vh - 48px)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 40px', borderBottom: '1px solid #D4D0C7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ ...labelStyle, marginBottom: '2px' }}>{supplier.supplier_code}</div>
            <h2 style={{ fontSize: '22px', fontWeight: 500, margin: 0 }}>Edit supplier</h2>
          </div>
          <button onClick={onClose} style={{ fontSize: '26px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>×</button>
        </div>

        <div style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1 }}>
          <div style={sectionStyle}>Basic</div>
          <Field label="Name *"><input value={form.supplier_name} onChange={e => update('supplier_name', e.target.value)} style={inputStyle} /></Field>
          <Field label="Type *"><select value={form.supplier_type} onChange={e => update('supplier_type', e.target.value)} style={inputStyle}><option>OEM</option><option>Agent</option><option>PKG</option></select></Field>
          <Field label="Access *"><select value={form.access_model} onChange={e => update('access_model', e.target.value)} style={inputStyle}><option>Direct</option><option>Indirect</option></select></Field>

          <div style={sectionStyle}>Payment Terms</div>
          <Field label="FG Terms"><input value={form.payment_terms_fg} onChange={e => update('payment_terms_fg', e.target.value)} style={inputStyle} /></Field>
          <Field label="Pkg Terms"><input value={form.payment_terms_pkg} onChange={e => update('payment_terms_pkg', e.target.value)} style={inputStyle} /></Field>

          <div style={sectionStyle}>Primary Contact</div>
          <Field label="Name"><input value={form.primary_contact_name} onChange={e => update('primary_contact_name', e.target.value)} style={inputStyle} /></Field>
          <Field label="Email"><input type="email" value={form.primary_contact_email} onChange={e => update('primary_contact_email', e.target.value)} style={inputStyle} /></Field>
          <Field label="Phone"><input value={form.primary_contact_phone} onChange={e => update('primary_contact_phone', e.target.value)} style={inputStyle} /></Field>
          <Field label="Channel"><select value={form.primary_contact_channel} onChange={e => update('primary_contact_channel', e.target.value)} style={inputStyle}><option>Whatsapp</option><option>Email</option><option>Phone</option></select></Field>

          <div style={sectionStyle}>Secondary Contact</div>
          <Field label="Name"><input value={form.secondary_contact_name} onChange={e => update('secondary_contact_name', e.target.value)} style={inputStyle} /></Field>
          <Field label="Email"><input type="email" value={form.secondary_contact_email} onChange={e => update('secondary_contact_email', e.target.value)} style={inputStyle} /></Field>
          <Field label="Phone"><input value={form.secondary_contact_phone} onChange={e => update('secondary_contact_phone', e.target.value)} style={inputStyle} /></Field>
          <Field label="Channel"><select value={form.secondary_contact_channel} onChange={e => update('secondary_contact_channel', e.target.value)} style={inputStyle}><option value="">(none)</option><option>Whatsapp</option><option>Email</option><option>Phone</option></select></Field>

          <div style={sectionStyle}>Notes</div>
          <textarea value={form.notes} onChange={e => update('notes', e.target.value)} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />

          {error && (
            <div style={{ padding: '12px', backgroundColor: '#F5DEDA', border: '1px solid #A53025', borderRadius: '4px', color: '#A53025', fontSize: '13px' }}>{error}</div>
          )}
        </div>

        <div style={{ padding: '16px 40px', borderTop: '1px solid #D4D0C7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button
            onClick={remove}
            disabled={submitting || deleting}
            style={{ padding: '8px 14px', borderRadius: '4px', fontSize: '13px', color: '#A53025', background: 'none', border: '1px solid #A53025', cursor: 'pointer' }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} disabled={submitting || deleting} style={{ padding: '8px 14px', borderRadius: '4px', fontSize: '13px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
            <button
              onClick={save}
              disabled={submitting || deleting || !form.supplier_name}
              style={{ padding: '8px 18px', borderRadius: '4px', fontSize: '13px', backgroundColor: '#1A1A1A', color: '#FAFAF7', border: 'none', cursor: 'pointer', opacity: (submitting || deleting || !form.supplier_name) ? 0.5 : 1 }}
            >
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