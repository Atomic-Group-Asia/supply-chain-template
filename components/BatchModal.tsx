'use client'

import { useState } from 'react'

export type Batch = {
  id: string
  brand: string | null
  sku: string
  batch_number: string
  manufactured_date: string | null
  expiry_date: string | null
  qty: number
  qty_remaining: number
  warehouse: string | null
  notes: string | null
  status: string
}

const STATUSES = ['active', 'depleted', 'expired', 'recalled']

/** Reusable Add/Edit Batch modal. Used both by the FG-Inventory SKU
 *  detail page and the standalone /batches list. */
export function BatchModal({
  batch,
  brand,
  sku,
  onClose,
  onSaved,
}: {
  batch: Batch | null
  brand: string
  sku: string
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!batch
  const [form, setForm] = useState({
    batch_number: batch?.batch_number || '',
    expiry_date: batch?.expiry_date || '',
    manufactured_date: batch?.manufactured_date || '',
    qty: batch?.qty?.toString() || '',
    qty_remaining: batch?.qty_remaining?.toString() ?? '',
    warehouse: batch?.warehouse || '',
    notes: batch?.notes || '',
    status: batch?.status || 'active',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function update(k: keyof typeof form, v: string) { setForm(prev => ({ ...prev, [k]: v })) }

  async function submit() {
    setSubmitting(true); setError('')
    try {
      const payload: any = {
        ...form,
        brand, sku,
        qty: parseInt(form.qty, 10),
        qty_remaining: form.qty_remaining === '' ? parseInt(form.qty, 10) : parseInt(form.qty_remaining, 10),
        expiry_date: form.expiry_date || null,
      }
      const url = isEdit ? `/api/batches/${batch!.id}` : '/api/batches'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Save failed'); return }
      onSaved()
    } catch (e: any) { setError(e.message) } finally { setSubmitting(false) }
  }

  async function remove() {
    if (!batch) return
    if (!confirm('Delete this batch? This cannot be undone.')) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/batches/${batch.id}`, { method: 'DELETE' })
      if (!res.ok) { setError((await res.json()).error || 'Delete failed'); return }
      onSaved()
    } finally { setSubmitting(false) }
  }

  return (
    <div onClick={() => !submitting && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg shadow-2xl w-full max-w-[560px] max-h-[calc(100vh-48px)] flex flex-col overflow-hidden">
        <div className="px-8 py-5 border-b border-[#D4D0C7] flex justify-between items-center">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1">{isEdit ? 'Edit batch' : 'New batch'}</div>
            <h2 className="text-[20px] font-medium">{sku}{brand ? ` · ${brand}` : ''}</h2>
          </div>
          <button onClick={onClose} className="text-[26px] text-[#6B6B6B] leading-none px-2">×</button>
        </div>
        <div className="px-8 py-5 flex flex-col gap-3 overflow-y-auto flex-1">
          <Field label="Batch Number (optional)">
            <input value={form.batch_number} onChange={e => update('batch_number', e.target.value)} placeholder="e.g. NOP 04/24 — leave blank if not known" className={inputCls} />
            <div className="text-[10px] font-mono text-[#6B6B6B] mt-1">
              If left blank, a placeholder is generated automatically. Fill in the OEM-issued number whenever it's available.
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Expiry Date *">
              <input type="date" value={form.expiry_date} onChange={e => update('expiry_date', e.target.value)} className={inputCls} />
            </Field>
            <Field label="Manufactured Date">
              <input type="date" value={form.manufactured_date} onChange={e => update('manufactured_date', e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Qty Received *">
            <input type="number" value={form.qty} onChange={e => update('qty', e.target.value)} className={inputCls} />
            <div className="text-[10px] font-mono text-[#6B6B6B] mt-1">
              Remaining qty is auto-calculated by FEFO against gsheet Available.
            </div>
          </Field>
          <Field label="Warehouse">
            <input value={form.warehouse} onChange={e => update('warehouse', e.target.value)} placeholder="e.g. NH-HQ" className={inputCls} />
          </Field>
          {isEdit && (
            <Field label="Status">
              <select value={form.status} onChange={e => update('status', e.target.value)} className={inputCls}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          )}
          <Field label="Notes">
            <textarea value={form.notes} onChange={e => update('notes', e.target.value)} className={`${inputCls} min-h-[60px]`} />
          </Field>
          {error && <div className="p-3 bg-[#F5DEDA] border border-[#A53025] rounded text-[#A53025] text-[13px]">{error}</div>}
        </div>
        <div className="px-8 py-4 border-t border-[#D4D0C7] flex justify-between gap-2">
          {isEdit ? (
            <button onClick={remove} disabled={submitting} className="px-3 py-2 border border-[#A53025] text-[#A53025] rounded text-[13px] hover:bg-[#F5DEDA]">Delete</button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} disabled={submitting} className="px-3 py-2 text-[#6B6B6B] text-[13px]">Cancel</button>
            <button onClick={submit} disabled={submitting || !form.qty || !form.expiry_date} className="px-4 py-2 bg-[#1A1A1A] text-white rounded text-[13px] disabled:opacity-50">
              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Batch'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const inputCls = 'w-full px-3 py-2 border border-[#D4D0C7] rounded text-[13px] focus:outline-none focus:border-[#C8432C]'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1.5 font-semibold">{label}</label>
      {children}
    </div>
  )
}
