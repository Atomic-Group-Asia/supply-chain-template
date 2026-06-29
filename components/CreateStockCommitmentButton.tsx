'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SkuSearchInput } from './SkuSearchInput'
import { extractSkusFromImage, matchSkusInText } from './extractSkusFromImage'

type LineItem = { product_sku: string; qty: string }

const initialForm = {
  commitment_type: 'campaign',
  reserved_for: '',
  wms_order_id: '',
  required_by_date: '',
  required_by_date_end: '',
  created_by: '',
  notes: '',
}
const initialLines: LineItem[] = [{ product_sku: '', qty: '' }]

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

export function CreateStockCommitmentButton({ products }: { products: any[] }) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(initialForm)
  const [lines, setLines] = useState<LineItem[]>(initialLines)
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)
  const [pasteText, setPasteText] = useState('')
  // Photos selected during creation. Uploaded after commitment is saved.
  const [proofFiles, setProofFiles] = useState<File[]>([])
  const router = useRouter()

  function extractFromText(text: string) {
    setError(''); setExtractMsg(null)
    const items = matchSkusInText(
      text,
      products.map(p => ({ sku: p.sku, product_name: p.product_name, brand: p.brand })),
    )
    if (items.length === 0) {
      setExtractMsg('No SKUs detected in pasted text — make sure each line contains a SKU code and a quantity.')
      return
    }
    setLines(items.map(it => ({ product_sku: it.sku, qty: String(it.qty) })))
    setExtractMsg(`Extracted ${items.length} SKU${items.length === 1 ? '' : 's'} from text — review and edit before saving.`)
    setPasteText('')
  }

  async function extractFromImage(file: File | Blob) {
    setExtracting(true); setExtractMsg('Reading image…'); setError('')
    try {
      // 100% client-side OCR — no API key, no cost, no data leaves the browser.
      const { items, unmatched } = await extractSkusFromImage(
        file,
        products.map(p => ({ sku: p.sku, product_name: p.product_name, brand: p.brand })),
      )
      if (items.length === 0) {
        if (unmatched.length > 0) {
          setExtractMsg(
            `OCR worked, but none of these SKUs are in your Products catalog: ${unmatched.join(', ')}. ` +
            `Add them via the Products page first, or fill manually below.`
          )
        } else {
          setExtractMsg('No SKUs detected. Try a clearer screenshot or fill manually below.')
        }
        return
      }
      setLines(items.map(it => ({ product_sku: it.sku, qty: String(it.qty) })))
      const tail = unmatched.length > 0
        ? ` Also saw but skipped (not in catalog): ${unmatched.join(', ')}.`
        : ''
      setExtractMsg(`Extracted ${items.length} SKU${items.length === 1 ? '' : 's'} — review and edit before saving.${tail}`)
    } catch (e: any) {
      setError(e?.message || 'Extraction failed')
      setExtractMsg(null)
    } finally {
      setExtracting(false)
    }
  }

  // Paste handler: paste image directly from clipboard while modal is open
  useEffect(() => {
    if (!open) return
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it.type.startsWith('image/')) {
          const file = it.getAsFile()
          if (file) {
            e.preventDefault()
            extractFromImage(file)
            return
          }
        }
      }
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, products])

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const update = (key: string, value: string) => setForm({ ...form, [key]: value })

  function updateLine(idx: number, field: keyof LineItem, value: string) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }
  function addLine() { setLines(prev => [...prev, { product_sku: '', qty: '' }]) }
  function removeLine(idx: number) {
    // Always allow removal. If this was the last line, swap in an empty
    // one rather than leaving zero rows (which would hide the inputs).
    setLines(prev => {
      const next = prev.filter((_, i) => i !== idx)
      return next.length > 0 ? next : [{ product_sku: '', qty: '' }]
    })
  }

  const validLines = lines.filter(l => l.product_sku.trim() && parseInt(l.qty as any, 10) > 0)

  async function submit() {
    setSubmitting(true); setError('')
    try {
      // Generate ONE group id so all per-SKU rows we're about to create
      // collapse into a single expandable entry in the list view.
      const commitment_group_id = (crypto as any).randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const results = await Promise.all(validLines.map(line =>
        fetch('/api/stock-commitments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            commitment_group_id,
            product_sku: line.product_sku.trim(),
            qty: parseInt(line.qty as any, 10),
          }),
        }).then(async r => ({ ok: r.ok, data: await r.json() }))
      ))
      const failed = results.find(r => !r.ok)
      if (failed) { setError(failed.data.error || 'Failed to create commitment'); return }

      // Commit succeeded → upload any warehouse-proof photos to the same
      // commitment_group_id. Best-effort: a failed photo upload doesn't
      // roll back the commitment.
      for (const f of proofFiles) {
        try {
          const fd = new FormData()
          fd.append('file', f)
          await fetch(`/api/stock-commitments/group/${commitment_group_id}/attachments`, {
            method: 'POST', body: fd,
          })
        } catch {}
      }

      setOpen(false); setForm(initialForm); setLines(initialLines); setProofFiles([]); router.refresh()
    } catch (e: any) { setError(e.message) } finally { setSubmitting(false) }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="bg-[#1A1A1A] text-[#FAFAF7] px-3.5 py-2 rounded text-[13px] hover:bg-[#C8432C] transition-colors">+ Stock Commitment</button>

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
                <div style={{ ...labelStyle, marginBottom: '2px' }}>New commitment</div>
                <h2 style={{ fontSize: '22px', fontWeight: 500, margin: 0 }}>Reserve stock</h2>
              </div>
              <button onClick={() => setOpen(false)} style={{ fontSize: '26px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '4px 8px' }}>×</button>
            </div>

            <div style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto', flex: 1 }}>
              <div style={sectionStyle}>For Whom & Type</div>
              <Field label="Reserved For *">
                <input value={form.reserved_for} onChange={e => update('reserved_for', e.target.value)} style={inputStyle} placeholder="e.g. May Shopee 5.5 Sale" />
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
              <Field label="WMS Order ID">
                <input value={form.wms_order_id} onChange={e => update('wms_order_id', e.target.value)} style={inputStyle} placeholder="e.g. SO-2026-0123 — confirms reserved in WMS" />
              </Field>

              <div style={sectionStyle}>Products ({validLines.length})</div>

              {/* Photo extraction helper */}
              <div style={{ padding: '12px 14px', background: '#FAFAF7', border: '1px dashed #D4D0C7', borderRadius: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ fontSize: '12px', color: '#3D3D3D' }}>
                    📷 <strong>Upload or paste a photo</strong> of the order list — SKUs + quantities will auto-fill.
                  </div>
                  <label style={{ padding: '6px 12px', border: '1px solid #D4D0C7', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--font-jetbrains-mono), monospace', background: 'white', cursor: extracting ? 'wait' : 'pointer', opacity: extracting ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                    {extracting ? 'Reading…' : 'Choose photo'}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={extracting}
                      onChange={e => { const f = e.target.files?.[0]; if (f) extractFromImage(f); e.target.value = '' }}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
                <div style={{ marginTop: '6px', fontSize: '10px', fontFamily: 'var(--font-jetbrains-mono), monospace', color: '#6B6B6B' }}>
                  Tip: you can also press <strong>Ctrl/Cmd+V</strong> here to paste a screenshot directly.
                </div>
                {extractMsg && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: extractMsg.startsWith('No SKUs') || extractMsg.startsWith('OCR worked') ? '#A87B1F' : '#4A6B3D', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                    {extractMsg}
                  </div>
                )}

                {/* Paste-as-text fallback. 100% reliable since no OCR involved. */}
                <details style={{ marginTop: '10px' }}>
                  <summary style={{ cursor: 'pointer', fontSize: '11px', color: '#6B6B6B', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
                    📋 Or paste SKU list as text (more reliable than photo)
                  </summary>
                  <textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder={'Paste one SKU + qty per line, or multiple separated by spaces, e.g.:\nN-DH-OAT-SAC 1000\nN-DH-SOY-SAC (500)\nN-DR-MINT-SAC × 200'}
                    style={{ marginTop: '8px', width: '100%', minHeight: '90px', padding: '8px 10px', border: '1px solid #D4D0C7', borderRadius: '4px', fontSize: '12px', fontFamily: 'var(--font-jetbrains-mono), monospace', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    onClick={() => extractFromText(pasteText)}
                    disabled={!pasteText.trim()}
                    style={{ marginTop: '6px', padding: '6px 12px', border: '1px solid #1A1A1A', background: '#1A1A1A', color: 'white', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--font-jetbrains-mono), monospace', cursor: 'pointer', opacity: pasteText.trim() ? 1 : 0.4 }}
                  >
                    Parse text → fill lines
                  </button>
                </details>
              </div>

              {lines.map((line, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', gap: '8px', alignItems: 'flex-start' }}>
                  <SkuSearchInput
                    value={line.product_sku}
                    onChange={v => updateLine(idx, 'product_sku', v)}
                    products={products}
                    placeholder="Type SKU or product name to search…"
                  />
                  <input
                    type="number"
                    value={line.qty}
                    onChange={e => updateLine(idx, 'qty', e.target.value)}
                    placeholder="Qty"
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    title="Remove SKU"
                    style={{ padding: '8px 10px', border: '1px solid #D4D0C7', borderRadius: '4px', background: 'white', color: '#A53025', cursor: 'pointer', fontSize: '14px', lineHeight: 1 }}
                  >×</button>
                </div>
              ))}
              <button
                type="button"
                onClick={addLine}
                style={{ alignSelf: 'flex-start', padding: '7px 14px', border: '1px dashed #D4D0C7', borderRadius: '4px', background: 'white', color: '#3D3D3D', cursor: 'pointer', fontSize: '12px', fontFamily: 'var(--font-jetbrains-mono), monospace' }}
              >
                + Add another SKU
              </button>

              <div style={sectionStyle}>Schedule</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Required From">
                  <input type="date" value={form.required_by_date} onChange={e => update('required_by_date', e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Required To (optional)">
                  <input type="date" value={form.required_by_date_end} onChange={e => update('required_by_date_end', e.target.value)} style={inputStyle} />
                </Field>
              </div>

              <div style={sectionStyle}>Created By & Notes</div>
              <Field label="Created By"><input value={form.created_by} onChange={e => update('created_by', e.target.value)} style={inputStyle} placeholder="e.g. Mic" /></Field>
              <Field label="Notes"><textarea value={form.notes} onChange={e => update('notes', e.target.value)} style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} /></Field>

              <div style={sectionStyle}>Warehouse Confirmation</div>
              <div style={{ padding: '12px 14px', background: '#FAFAF7', border: '1px dashed #D4D0C7', borderRadius: '6px' }}>
                <div style={{ fontSize: '12px', color: '#3D3D3D', marginBottom: '8px' }}>
                  📷 Upload photo(s) showing warehouse has reserved this stock (optional but recommended).
                </div>
                <label style={{ display: 'inline-block', padding: '6px 12px', border: '1px solid #D4D0C7', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--font-jetbrains-mono), monospace', background: 'white', cursor: 'pointer' }}>
                  Choose photo(s)
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    multiple
                    onChange={e => {
                      if (e.target.files?.length) {
                        setProofFiles(prev => [...prev, ...Array.from(e.target.files!)])
                      }
                      e.target.value = ''
                    }}
                    style={{ display: 'none' }}
                  />
                </label>
                {proofFiles.length > 0 && (
                  <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '8px' }}>
                    {proofFiles.map((f, i) => {
                      const isImg = f.type.startsWith('image/')
                      const url = isImg ? URL.createObjectURL(f) : ''
                      return (
                        <div key={i} style={{ position: 'relative', border: '1px solid #E8E5DE', borderRadius: '4px', overflow: 'hidden', background: 'white' }}>
                          {isImg ? (
                            <img src={url} alt={f.name} style={{ width: '100%', height: '80px', objectFit: 'cover', display: 'block' }} onLoad={() => URL.revokeObjectURL(url)} />
                          ) : (
                            <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>📄</div>
                          )}
                          <div style={{ padding: '4px 6px', fontSize: '10px', color: '#6B6B6B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>{f.name}</div>
                          <button
                            type="button"
                            onClick={() => setProofFiles(prev => prev.filter((_, j) => j !== i))}
                            title="Remove"
                            style={{ position: 'absolute', top: '2px', right: '2px', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(0,0,0,0.5)', color: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >×</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {error && (
                <div style={{ padding: '12px', backgroundColor: '#F5DEDA', border: '1px solid #A53025', borderRadius: '4px', color: '#A53025', fontSize: '13px' }}>{error}</div>
              )}
            </div>

            <div style={{ padding: '16px 40px', borderTop: '1px solid #D4D0C7', display: 'flex', justifyContent: 'flex-end', gap: '8px', flexShrink: 0 }}>
              <button onClick={() => setOpen(false)} disabled={submitting} style={{ padding: '8px 14px', borderRadius: '4px', fontSize: '13px', color: '#6B6B6B', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submit} disabled={submitting || validLines.length === 0 || !form.reserved_for} style={{ padding: '8px 18px', borderRadius: '4px', fontSize: '13px', backgroundColor: '#1A1A1A', color: '#FAFAF7', border: 'none', cursor: 'pointer', opacity: (submitting || validLines.length === 0 || !form.reserved_for) ? 0.5 : 1 }}>
                {submitting ? 'Creating...' : `Reserve ${validLines.length || ''} SKU${validLines.length === 1 ? '' : 's'}`}
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