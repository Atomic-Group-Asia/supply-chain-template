'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

const initialForm = {
  supplier_name: '',
  supplier_type: 'OEM',
  access_model: 'Direct',
  payment_terms_fg: '',
  payment_terms_pkg: '',
  primary_contact_name: '',
  primary_contact_email: '',
  primary_contact_phone: '',
  primary_contact_channel: 'Whatsapp',
  secondary_contact_name: '',
  secondary_contact_email: '',
  secondary_contact_phone: '',
  secondary_contact_channel: '',
  notes: '',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #D4D0C7',
  borderRadius: '4px',
  fontSize: '13px',
  backgroundColor: 'white',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-jetbrains-mono), monospace',
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6B6B6B',
  marginBottom: '6px',
  fontWeight: 600,
}

const sectionStyle: React.CSSProperties = {
  fontFamily: 'var(--font-jetbrains-mono), monospace',
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: '#6B6B6B',
  paddingTop: '16px',
  marginTop: '8px',
  borderTop: '1px solid #E8E5DE',
  fontWeight: 600,
}

export function CreateSupplierButton() {
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
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Unknown error'); return }
      setOpen(false)
      setForm(initialForm)
      router.refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-[#1A1A1A] text-[#FAFAF7] px-3.5 py-2 rounded text-[13px] hover:bg-[#C8432C] transition-colors"
      >
        + New Supplier
      </button>

      {open && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            boxSizing: 'border-box',
          }}
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              width: '100%',
              maxWidth: '720px',
              maxHeight: 'calc(100vh - 48px)',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              padding: '20px 40px',
              borderBottom: '1px solid #D4D0C7',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              <div>
                <div style={{ ...labelStyle, marginBottom: '2px' }}>New supplier</div>
                <h2 style={{ fontSize: '22px', fontWeight: 500, margin: 0 }}>Create supplier</h2>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ fontSize: '26px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}
              >×</button>
            </div>

            {/* Body */}
            <div style={{
              padding: '24px 40px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              overflowY: 'auto',
              flex: 1,
            }}>
              <div style={sectionStyle}>Basic</div>
              <Field label="Name *">
                <input value={form.supplier_name} onChange={e => update('supplier_name', e.target.value)} style={inputStyle} placeholder="Full legal name" />
              </Field>
              <Field label="Type *">
                <select value={form.supplier_type} onChange={e => update('supplier_type', e.target.value)} style={inputStyle}>
                  <option>OEM</option><option>Agent</option><option>PKG</option>
                </select>
              </Field>
              <Field label="Access *">
                <select value={form.access_model} onChange={e => update('access_model', e.target.value)} style={inputStyle}>
                  <option>Direct</option><option>Indirect</option>
                </select>
              </Field>

              <div style={sectionStyle}>Payment Terms</div>
              <Field label="FG Terms">
                <input value={form.payment_terms_fg} onChange={e => update('payment_terms_fg', e.target.value)} style={inputStyle} placeholder="e.g. 30d net" />
              </Field>
              <Field label="Pkg Terms">
                <input value={form.payment_terms_pkg} onChange={e => update('payment_terms_pkg', e.target.value)} style={inputStyle} placeholder="e.g. Cash Term" />
              </Field>

              <div style={sectionStyle}>Primary Contact</div>
              <Field label="Name">
                <input value={form.primary_contact_name} onChange={e => update('primary_contact_name', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Email">
                <input type="email" value={form.primary_contact_email} onChange={e => update('primary_contact_email', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Phone">
                <input value={form.primary_contact_phone} onChange={e => update('primary_contact_phone', e.target.value)} style={inputStyle} placeholder="e.g. 60123456789" />
              </Field>
              <Field label="Channel">
                <select value={form.primary_contact_channel} onChange={e => update('primary_contact_channel', e.target.value)} style={inputStyle}>
                  <option>Whatsapp</option><option>Email</option><option>Phone</option>
                </select>
              </Field>

              <div style={sectionStyle}>Secondary Contact (optional)</div>
              <Field label="Name">
                <input value={form.secondary_contact_name} onChange={e => update('secondary_contact_name', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Email">
                <input type="email" value={form.secondary_contact_email} onChange={e => update('secondary_contact_email', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Phone">
                <input value={form.secondary_contact_phone} onChange={e => update('secondary_contact_phone', e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Channel">
                <select value={form.secondary_contact_channel} onChange={e => update('secondary_contact_channel', e.target.value)} style={inputStyle}>
                  <option value="">(none)</option><option>Whatsapp</option><option>Email</option><option>Phone</option>
                </select>
              </Field>

              <div style={sectionStyle}>Notes</div>
              <textarea
                value={form.notes}
                onChange={e => update('notes', e.target.value)}
                style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                placeholder="Brands, notes, anything else..."
              />

              <div style={{ ...labelStyle, marginTop: '8px', marginBottom: 0 }}>
                Supplier code will auto-generate (SUP-XXXXXX)
              </div>

              {error && (
                <div style={{ padding: '12px', backgroundColor: '#F5DEDA', border: '1px solid #A53025', borderRadius: '4px', color: '#A53025', fontSize: '13px' }}>
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              padding: '16px 40px',
              borderTop: '1px solid #D4D0C7',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              flexShrink: 0,
            }}>
              <button
                onClick={() => setOpen(false)}
                disabled={submitting}
                style={{ padding: '8px 14px', borderRadius: '4px', fontSize: '13px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={submitting || !form.supplier_name}
                style={{
                  padding: '8px 18px',
                  borderRadius: '4px',
                  fontSize: '13px',
                  backgroundColor: '#1A1A1A',
                  color: '#FAFAF7',
                  border: 'none',
                  cursor: 'pointer',
                  opacity: (submitting || !form.supplier_name) ? 0.5 : 1,
                }}
              >
                {submitting ? 'Creating...' : 'Create Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}