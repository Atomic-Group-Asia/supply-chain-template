'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SkuSearchInput } from './SkuSearchInput'

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

export function EditStockCommitmentModal({ commitment, products, onClose }: { commitment: any; products: any[]; onClose: () => void }) {
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    product_sku: commitment.product_sku || '',
    commitment_type: commitment.commitment_type || 'campaign',
    qty: commitment.qty ?? '',
    reserved_for: commitment.reserved_for || '',
    wms_order_id: commitment.wms_order_id || '',
    required_by_date: commitment.required_by_date || '',
    required_by_date_end: commitment.required_by_date_end || '',
    created_by: commitment.created_by || '',
    notes: commitment.notes || '',
    status: commitment.status || 'active',
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
      const res = await fetch(`/api/stock-commitments/${commitment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, qty: parseInt(form.qty as any, 10) }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      onClose(); router.refresh()
    } catch (e: any) { setError(e.message) } finally { setSubmitting(false) }
  }

  async function remove() {
    if (!confirm('Delete this commitment?')) return
    setDeleting(true); setError('')
    try {
      const res = await fetch(`/api/stock-commitments/${commitment.id}`, { method: 'DELETE' })
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
        style={{ backgroundColor: 'white', borderRadius: '8px', width: '100%', maxWidth: '640px', maxHeight: 'calc(100vh - 48px)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 40px', borderBottom: '1px solid #D4D0C7', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <div style={{ ...labelStyle, marginBottom: '2px' }}>{commitment.reserved_for}</div>
            <h2 style={{ fontSize: '22px', fontWeight: 500, margin: 0 }}>Edit commitment</h2>
          </div>
          <button onClick={onClose} style={{ fontSize: '26px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>×</button>
        </div>

        <div style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1 }}>
          <div style={sectionStyle}>What & For Whom</div>
          <Field label="Product *">
            <SkuSearchInput
              value={form.product_sku}
              onChange={v => update('product_sku', v)}
              products={products}
              placeholder="Type SKU or product name to search…"
            />
          </Field>
          <Field label="Type *">
            <select value={form.commitment_type} onChange={e => update('commitment_type', e.target.value)} style={inputStyle}>
              <option value="campaign">Campaign</option>
              <option value="roadshow">Roadshow</option>
              <option value="pharmacy_push">Pharmacy Push</option>
              <option value="so">SO (Sales Order)</option>
              <option value="influencer_sampling">Influencer Sampling</option>
            </select>
          </Field>
          <Field label="Qty *"><input type="number" value={form.qty} onChange={e => update('qty', e.target.value)} style={inputStyle} /></Field>
          <Field label="Reserved For *"><input value={form.reserved_for} onChange={e => update('reserved_for', e.target.value)} style={inputStyle} /></Field>
          <Field label="WMS Order ID">
            <input value={form.wms_order_id} onChange={e => update('wms_order_id', e.target.value)} style={inputStyle} placeholder="e.g. SO-2026-0123 — confirms reserved in WMS" />
          </Field>

          <div style={sectionStyle}>Schedule & Status</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Required From"><input type="date" value={form.required_by_date} onChange={e => update('required_by_date', e.target.value)} style={inputStyle} /></Field>
            <Field label="Required To (optional)"><input type="date" value={form.required_by_date_end} onChange={e => update('required_by_date_end', e.target.value)} style={inputStyle} /></Field>
          </div>
          <Field label="Status">
            <select value={form.status} onChange={e => update('status', e.target.value)} style={inputStyle}>
              <option value="active">Active</option>
              <option value="fulfilled">Fulfilled</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>

          <div style={sectionStyle}>Created By & Notes</div>
          <Field label="Created By"><input value={form.created_by} onChange={e => update('created_by', e.target.value)} style={inputStyle} /></Field>
          <Field label="Notes"><textarea value={form.notes} onChange={e => update('notes', e.target.value)} style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} /></Field>

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
            <button onClick={save} disabled={submitting || deleting || !form.product_sku || !form.qty || !form.reserved_for} style={{ padding: '8px 18px', borderRadius: '4px', fontSize: '13px', backgroundColor: '#1A1A1A', color: '#FAFAF7', border: 'none', cursor: 'pointer', opacity: (submitting || deleting || !form.product_sku || !form.qty || !form.reserved_for) ? 0.5 : 1 }}>
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