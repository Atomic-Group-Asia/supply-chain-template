'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type POLine = {
  id: string
  sku: string | null
  product_name: string
  qty: number
  received_qty: number
  uom: string
  unit_cost: number
}

type InvoiceItem = {
  id: string
  invoice_id: string
  po_item_id: string
  qty: number
}

type Invoice = {
  id: string
  po_id: string
  invoice_number: string
  invoice_date: string | null
  amount: number
  pdf_path: string | null
  pdf_filename: string | null
  paid_amount: number
  paid_status: 'unpaid' | 'partial' | 'paid'
  paid_at: string | null
  paid_by: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  items: InvoiceItem[]
}

const statusColor: Record<string, string> = {
  unpaid: 'bg-[#EDEAE2] text-[#6B6B6B]',
  partial: 'bg-[#F5EDD6] text-[#A87B1F]',
  paid: 'bg-[#E8EFE5] text-[#4A6B3D]',
}

function fmtRM(n: number) {
  return `RM ${(Number(n) || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function POInvoicesSection({
  poId, poTotal, poLines, initialInvoices,
}: {
  poId: string
  poTotal: number
  poLines: POLine[]
  initialInvoices: Invoice[]
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [paying, setPaying] = useState<Invoice | null>(null)
  const [actor, setActor] = useState('Syuen')

  const invoices = initialInvoices

  const totals = useMemo(() => {
    const invoiced = invoices.reduce((s, i) => s + Number(i.amount || 0), 0)
    const paid = invoices.reduce((s, i) => s + Number(i.paid_amount || 0), 0)
    return { invoiced, paid, outstanding: invoiced - paid, vsPo: poTotal - invoiced }
  }, [invoices, poTotal])

  return (
    <div className="bg-white border border-[#D4D0C7] rounded">
      <div className="px-5 py-3.5 bg-[#FAFAF7] border-b border-[#D4D0C7] flex items-center justify-between">
        <div className="font-medium text-[15px]">
          Invoices ({invoices.length})
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] uppercase tracking-wider font-mono text-[#6B6B6B]">Acting as</label>
          <select
            value={actor}
            onChange={e => setActor(e.target.value)}
            className="px-2 py-1 border border-[#D4D0C7] rounded text-[12px] bg-white"
          >
            <option>Grace</option>
            <option>Jun Ye</option>
            <option>Syuen</option>
          </select>
          <button
            onClick={() => setAdding(true)}
            className="px-3 py-1.5 bg-[#1A1A1A] text-white rounded text-[12px] hover:bg-black"
          >+ Add Invoice</button>
        </div>
      </div>

      <div className="px-5 py-3.5 border-b border-[#E8E5DE] grid grid-cols-4 gap-4">
        <Stat label="PO Total" value={fmtRM(poTotal)} />
        <Stat label="Invoiced" value={fmtRM(totals.invoiced)} note={Math.abs(totals.vsPo) > 0.01 ? (totals.vsPo > 0 ? `${fmtRM(totals.vsPo)} unbilled` : `${fmtRM(-totals.vsPo)} over`) : undefined} />
        <Stat label="Paid" value={fmtRM(totals.paid)} tone="ok" />
        <Stat label="Outstanding" value={fmtRM(totals.outstanding)} tone={totals.outstanding > 0.01 ? 'warn' : 'muted'} />
      </div>

      {invoices.length === 0 && (
        <div className="px-5 py-12 text-center text-[#6B6B6B]">
          <div className="text-[13px] mb-1">No invoices yet</div>
          <div className="text-[11px]">Click "+ Add Invoice" once the OEM issues one. You can record payments per-invoice.</div>
        </div>
      )}

      <div className="divide-y divide-[#F0EDE4]">
        {invoices.map(inv => (
          <InvoiceCard
            key={inv.id}
            inv={inv}
            poLines={poLines}
            onPay={() => setPaying(inv)}
            onDeleted={() => router.refresh()}
          />
        ))}
      </div>

      {adding && (
        <AddInvoiceModal
          poId={poId}
          poLines={poLines}
          actor={actor}
          alreadyAllocated={buildAllocatedMap(invoices)}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); router.refresh() }}
        />
      )}

      {paying && (
        <RecordPaymentModal
          invoice={paying}
          actor={actor}
          onClose={() => setPaying(null)}
          onSaved={() => { setPaying(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function Stat({ label, value, tone, note }: { label: string; value: string; tone?: 'ok' | 'warn' | 'muted'; note?: string }) {
  const color = tone === 'warn' ? '#C8432C' : tone === 'ok' ? '#4A6B3D' : tone === 'muted' ? '#6B6B6B' : '#1A1A1A'
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-0.5">{label}</div>
      <div className="font-mono text-[15px] font-semibold sensitive" style={{ color }}>{value}</div>
      {note && <div className="text-[10px] font-mono text-[#6B6B6B] mt-0.5">{note}</div>}
    </div>
  )
}

function InvoiceCard({
  inv, poLines, onPay, onDeleted,
}: {
  inv: Invoice
  poLines: POLine[]
  onPay: () => void
  onDeleted: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  async function openPdf() {
    if (!inv.pdf_path) return
    setPdfBusy(true)
    try {
      const res = await fetch(`/api/po-invoices/${inv.id}`)
      const json = await res.json()
      if (json.pdf_signed_url) window.open(json.pdf_signed_url, '_blank')
    } finally { setPdfBusy(false) }
  }

  async function remove() {
    if (!confirm(`Delete invoice ${inv.invoice_number}? This will remove the PDF and all line allocations.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/po-invoices/${inv.id}`, { method: 'DELETE' })
      if (!res.ok) { alert('Delete failed'); return }
      onDeleted()
    } finally { setBusy(false) }
  }

  const outstanding = Number(inv.amount || 0) - Number(inv.paid_amount || 0)
  return (
    <div className="px-5 py-3.5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[14px] font-semibold">{inv.invoice_number}</span>
            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${statusColor[inv.paid_status] || ''}`}>
              {inv.paid_status}
            </span>
          </div>
          <div className="text-[11px] text-[#6B6B6B] mt-0.5 font-mono">
            {inv.invoice_date || 'no date'} · <span className="sensitive">{fmtRM(inv.amount)}</span>
            {inv.paid_amount > 0 && <> · paid <span className="sensitive">{fmtRM(inv.paid_amount)}</span></>}
            {outstanding > 0.01 && <> · outstanding <span className="sensitive text-[#C8432C]">{fmtRM(outstanding)}</span></>}
          </div>
        </div>
        <div className="flex gap-1.5">
          {inv.pdf_path && (
            <button
              onClick={openPdf}
              disabled={pdfBusy}
              className="px-2.5 py-1 border border-[#1A1A1A] text-[#1A1A1A] rounded text-[11px] hover:bg-[#FAFAF7] disabled:opacity-50"
            >📄 {pdfBusy ? '…' : 'PDF'}</button>
          )}
          {inv.paid_status !== 'paid' && (
            <button
              onClick={onPay}
              className="px-2.5 py-1 bg-[#4A6B3D] text-white rounded text-[11px] hover:bg-[#3A5530]"
            >💰 Record Payment</button>
          )}
          <button
            onClick={remove}
            disabled={busy}
            className="px-2.5 py-1 border border-[#A53025] text-[#A53025] rounded text-[11px] hover:bg-[#F5DEDA]"
          >Delete</button>
        </div>
      </div>
      <div className="text-[11px] text-[#6B6B6B] mt-1">
        <span className="uppercase tracking-wider font-mono mr-1.5">covers:</span>
        {inv.items.length === 0
          ? <span className="italic">no lines</span>
          : inv.items.map((it, i) => {
              const line = poLines.find(p => p.id === it.po_item_id)
              if (!line) return null
              return (
                <span key={it.id} className="inline-block mr-2">
                  <span className="font-mono text-[#1A1A1A]">{line.sku || '—'}</span>
                  <span className="font-mono"> × {Number(it.qty || 0).toLocaleString()}</span>
                  {i < inv.items.length - 1 ? ',' : ''}
                </span>
              )
            })}
      </div>
      {inv.notes && (
        <div className="text-[11px] text-[#6B6B6B] italic mt-1">{inv.notes}</div>
      )}
      {inv.paid_at && inv.paid_by && (
        <div className="text-[10px] text-[#6B6B6B] font-mono mt-1">
          Last payment: {inv.paid_by} on {new Date(inv.paid_at).toLocaleString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' })}
        </div>
      )}
    </div>
  )
}

/** For each PO line, sum qty already allocated to invoices so AddInvoiceModal
 *  can suggest remaining qty and prevent over-allocation. */
function buildAllocatedMap(invoices: Invoice[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const inv of invoices) {
    for (const it of inv.items) {
      m.set(it.po_item_id, (m.get(it.po_item_id) || 0) + Number(it.qty || 0))
    }
  }
  return m
}

function AddInvoiceModal({
  poId, poLines, actor, alreadyAllocated, onClose, onSaved,
}: {
  poId: string
  poLines: POLine[]
  actor: string
  alreadyAllocated: Map<string, number>
  onClose: () => void
  onSaved: () => void
}) {
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [selectedLines, setSelectedLines] = useState<Record<string, { selected: boolean; qty: number }>>(() => {
    const init: Record<string, { selected: boolean; qty: number }> = {}
    for (const ln of poLines) {
      const remaining = Math.max(0, ln.qty - (alreadyAllocated.get(ln.id) || 0))
      init[ln.id] = { selected: false, qty: remaining }
    }
    return init
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Auto-compute invoice amount from selected line qty × unit_cost
  const computedAmount = useMemo(() => {
    let total = 0
    for (const ln of poLines) {
      const sel = selectedLines[ln.id]
      if (!sel?.selected) continue
      total += (Number(sel.qty) || 0) * (Number(ln.unit_cost) || 0)
    }
    return total
  }, [selectedLines, poLines])
  const [amount, setAmount] = useState(0)
  // Keep amount synced with computed unless user manually overrides
  const [amountTouched, setAmountTouched] = useState(false)
  const effectiveAmount = amountTouched ? amount : computedAmount

  async function submit() {
    setError('')
    if (!invoiceNumber.trim()) { setError('Invoice number is required'); return }
    if (effectiveAmount <= 0) { setError('Amount must be > 0'); return }
    const items = Object.entries(selectedLines)
      .filter(([, v]) => v.selected && Number(v.qty) > 0)
      .map(([po_item_id, v]) => ({ po_item_id, qty: Number(v.qty) }))
    if (items.length === 0) { setError('Select at least one PO line'); return }

    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('invoice_number', invoiceNumber.trim())
      if (invoiceDate) fd.append('invoice_date', invoiceDate)
      fd.append('amount', String(effectiveAmount))
      if (notes) fd.append('notes', notes)
      fd.append('created_by', actor)
      fd.append('items', JSON.stringify(items))
      if (file) fd.append('file', file)
      const res = await fetch(`/api/purchase-orders/${poId}/invoices`, { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Save failed'); return }
      onSaved()
    } catch (e: any) { setError(e?.message || 'Save failed') }
    finally { setSubmitting(false) }
  }

  return (
    <div onClick={() => !submitting && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg shadow-2xl w-full max-w-[720px] max-h-[calc(100vh-48px)] flex flex-col overflow-hidden">
        <div className="px-7 py-5 border-b border-[#D4D0C7] flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-0.5">New invoice</div>
            <h2 className="text-[19px] font-medium">Add Invoice to PO</h2>
          </div>
          <button onClick={onClose} className="text-[26px] text-[#6B6B6B] leading-none px-2">×</button>
        </div>

        <div className="px-7 py-5 flex flex-col gap-3 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Invoice Number *">
              <input value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} placeholder="e.g. INV-2026-001" className={inputCls} />
            </Field>
            <Field label="Invoice Date">
              <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <Field label="PDF File (optional)">
            <input type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} className="text-[12px]" />
            {file && <div className="text-[10px] text-[#6B6B6B] mt-1">{file.name} · {(file.size / 1024).toFixed(0)} KB</div>}
          </Field>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1.5 font-semibold">PO Lines covered by this invoice *</label>
            <div className="border border-[#D4D0C7] rounded overflow-hidden">
              <table className="w-full text-[12px]">
                <thead className="bg-[#FAFAF7] text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
                  <tr>
                    <th className="px-3 py-2 text-left w-7"></th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Ordered</th>
                    <th className="px-3 py-2 text-right">Remaining</th>
                    <th className="px-3 py-2 text-right">This Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {poLines.map(ln => {
                    const allocated = alreadyAllocated.get(ln.id) || 0
                    const remaining = Math.max(0, ln.qty - allocated)
                    const sel = selectedLines[ln.id]
                    return (
                      <tr key={ln.id} className="border-t border-[#F0EDE4]">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={sel?.selected || false}
                            disabled={remaining <= 0}
                            onChange={e => setSelectedLines(prev => ({
                              ...prev, [ln.id]: { ...prev[ln.id], selected: e.target.checked },
                            }))}
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-[#C8432C]">{ln.sku || '—'}</td>
                        <td className="px-3 py-2">{ln.product_name}</td>
                        <td className="px-3 py-2 text-right font-mono">{ln.qty.toLocaleString()} {ln.uom}</td>
                        <td className="px-3 py-2 text-right font-mono text-[#6B6B6B]">{remaining.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            value={sel?.qty || 0}
                            min={0}
                            disabled={!sel?.selected}
                            onChange={e => setSelectedLines(prev => ({
                              ...prev,
                              [ln.id]: { ...prev[ln.id], qty: Math.max(0, Number(e.target.value) || 0) },
                            }))}
                            className={`px-2 py-1 border rounded text-[11px] w-[90px] text-right font-mono disabled:opacity-40 ${
                              sel?.selected && (sel.qty || 0) > remaining ? 'border-[#A87B1F] bg-[#FFF8E5]' : 'border-[#D4D0C7]'
                            }`}
                            title={sel?.selected && (sel.qty || 0) > remaining ? `Over by ${((sel.qty || 0) - remaining).toLocaleString()} (factory over-produced)` : ''}
                          />
                          {sel?.selected && (sel.qty || 0) > remaining && (
                            <div className="text-[9px] text-[#A87B1F] font-mono mt-0.5 whitespace-nowrap">
                              +{((sel.qty || 0) - remaining).toLocaleString()} over
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-[10px] text-[#6B6B6B] mt-1.5">
              "Remaining" = ordered qty minus what's already allocated to other invoices. You can split a line across invoices by entering a partial qty, or enter MORE than remaining if the factory over-produced (highlighted amber).
            </div>
          </div>

          <Field label="Amount *">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-[#6B6B6B]">RM</span>
              <input
                type="number"
                step="0.01"
                value={effectiveAmount}
                onChange={e => { setAmount(Number(e.target.value) || 0); setAmountTouched(true) }}
                className={inputCls + ' w-[200px]'}
              />
              {amountTouched && (
                <button
                  type="button"
                  onClick={() => setAmountTouched(false)}
                  className="text-[10px] font-mono text-[#C8432C] underline"
                >reset to computed</button>
              )}
            </div>
            <div className="text-[10px] text-[#6B6B6B] mt-1">
              Auto-computed from line qty × unit cost: <span className="sensitive">{fmtRM(computedAmount)}</span>
              {amountTouched && <span className="ml-2 text-[#C8432C]">(manually overridden)</span>}
            </div>
          </Field>

          <Field label="Notes">
            <textarea value={notes} onChange={e => setNotes(e.target.value)} className={`${inputCls} min-h-[50px]`} placeholder="Optional" />
          </Field>

          {error && <div className="p-3 bg-[#F5DEDA] border border-[#A53025] rounded text-[#A53025] text-[13px]">{error}</div>}
        </div>

        <div className="px-7 py-4 border-t border-[#D4D0C7] flex justify-end gap-2">
          <button onClick={onClose} disabled={submitting} className="px-3 py-2 text-[#6B6B6B] text-[13px]">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting || !invoiceNumber.trim() || effectiveAmount <= 0}
            className="px-4 py-2 bg-[#1A1A1A] text-white rounded text-[13px] disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Add Invoice'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RecordPaymentModal({
  invoice, actor, onClose, onSaved,
}: {
  invoice: Invoice
  actor: string
  onClose: () => void
  onSaved: () => void
}) {
  const outstanding = Number(invoice.amount || 0) - Number(invoice.paid_amount || 0)
  const [amount, setAmount] = useState(outstanding)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    setError('')
    if (amount <= 0) { setError('Amount must be > 0'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/po-invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record_payment', amount, actor }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed'); return }
      onSaved()
    } catch (e: any) { setError(e?.message || 'Failed') }
    finally { setSubmitting(false) }
  }

  return (
    <div onClick={() => !submitting && onClose()} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg shadow-2xl w-full max-w-[440px]">
        <div className="px-7 py-5 border-b border-[#D4D0C7]">
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-0.5">Record payment</div>
          <h2 className="text-[18px] font-medium">{invoice.invoice_number}</h2>
        </div>
        <div className="px-7 py-5 flex flex-col gap-3">
          <div className="text-[12px] text-[#6B6B6B] font-mono">
            Amount <span className="sensitive">{fmtRM(invoice.amount)}</span>
            {' · '}paid <span className="sensitive">{fmtRM(invoice.paid_amount)}</span>
            {' · '}outstanding <span className="sensitive text-[#C8432C]">{fmtRM(outstanding)}</span>
          </div>
          <Field label="Pay RM *">
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={e => setAmount(Number(e.target.value) || 0)}
              className={inputCls}
            />
            <div className="flex gap-1.5 mt-1.5">
              <QuickBtn label={`30% (${fmtRM(invoice.amount * 0.3)})`} onClick={() => setAmount(Math.round(invoice.amount * 0.3 * 100) / 100)} />
              <QuickBtn label={`50% (${fmtRM(invoice.amount * 0.5)})`} onClick={() => setAmount(Math.round(invoice.amount * 0.5 * 100) / 100)} />
              <QuickBtn label="Balance" onClick={() => setAmount(outstanding)} />
            </div>
          </Field>
          {error && <div className="p-3 bg-[#F5DEDA] border border-[#A53025] rounded text-[#A53025] text-[13px]">{error}</div>}
        </div>
        <div className="px-7 py-4 border-t border-[#D4D0C7] flex justify-end gap-2">
          <button onClick={onClose} disabled={submitting} className="px-3 py-2 text-[#6B6B6B] text-[13px]">Cancel</button>
          <button
            onClick={submit}
            disabled={submitting || amount <= 0}
            className="px-4 py-2 bg-[#4A6B3D] text-white rounded text-[13px] disabled:opacity-50 hover:bg-[#3A5530]"
          >
            {submitting ? 'Saving…' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1.5 font-semibold">{label}</label>
      {children}
    </div>
  )
}

function QuickBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-1 border border-[#4A6B3D] text-[#4A6B3D] rounded text-[10px] hover:bg-[#4A6B3D] hover:text-white transition-colors"
    >{label}</button>
  )
}

const inputCls = 'w-full px-3 py-2 border border-[#D4D0C7] rounded text-[13px] focus:outline-none focus:border-[#C8432C]'
