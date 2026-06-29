'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useCurrentUser } from './CurrentUserContext'

type BrandOption = { code: string; label: string }

type FefoStep = {
  batch_id: string
  batch_number: string
  expiry_date: string | null
  deduct: number
  new_remaining: number
}

type Diff = {
  sku: string
  product_name: string
  current_qty: number
  new_qty: number
  delta: number
  change: 'outflow' | 'inflow' | 'no_change'
  fefo_plan: FefoStep[] | null
  short_by: number
}

type PreviewResult = {
  brand: string
  headers_detected: { sku: string; closing: string }
  total_skus: number
  unknown_skus: string[]
  diffs: Diff[]
}

export function UploadDailyStockClient({ brandOptions }: { brandOptions: BrandOption[] }) {
  const router = useRouter()
  const { current } = useCurrentUser()
  const [brand, setBrand] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ outflows: number; inflows: number; errors: string[] } | null>(null)

  async function runPreview() {
    if (!brand || !file) { setError('Pick a brand and file first.'); return }
    setError(''); setPreview(null); setDone(null); setPreviewing(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('brand', brand)
      const res = await fetch('/api/inventory/preview', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Preview failed'); return }
      setPreview(data)
    } catch (e: any) {
      setError(e?.message || 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

  async function runApply() {
    if (!preview) return
    setError(''); setApplying(true); setDone(null)
    try {
      const res = await fetch('/api/inventory/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand: preview.brand, diffs: preview.diffs, uploaded_by: current.name }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Apply failed'); return }
      setDone({ outflows: data.outflows_applied, inflows: data.inflows_applied, errors: data.errors || [] })
      setPreview(null); setFile(null)
      router.refresh()
    } catch (e: any) {
      setError(e?.message || 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Step n={1} title="Select brand">
        <div className="flex gap-2 flex-wrap">
          {brandOptions.map(b => (
            <button
              key={b.code}
              type="button"
              onClick={() => { setBrand(b.code); setPreview(null) }}
              className={`px-3 py-1.5 rounded-full text-[12px] font-mono border transition-colors ${
                brand === b.code ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white border-[#D4D0C7] text-[#3D3D3D] hover:border-[#1A1A1A]'
              }`}
            >{b.label}</button>
          ))}
        </div>
      </Step>

      <Step n={2} title="Upload Excel or CSV" disabled={!brand}>
        <div className="flex items-center gap-3 flex-wrap">
          <label className={`inline-flex items-center px-3 py-1.5 border border-[#D4D0C7] rounded text-[13px] ${brand ? 'cursor-pointer hover:bg-[#FAFAF7]' : 'cursor-not-allowed opacity-40'}`}>
            Choose .xlsx / .csv file
            <input
              type="file" accept=".xlsx,.xls,.csv,text/csv" disabled={!brand}
              onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); setDone(null) }}
              className="hidden"
            />
          </label>
          {file && <span className="text-[12px] font-mono text-[#3D3D3D]">{file.name}</span>}
          <button
            onClick={runPreview}
            disabled={!brand || !file || previewing}
            className="ml-auto px-3.5 py-1.5 bg-[#1A1A1A] text-white rounded text-[13px] disabled:opacity-50"
          >{previewing ? 'Reading…' : 'Preview changes'}</button>
        </div>
      </Step>

      {error && (
        <div className="p-3 bg-[#F5DEDA] border border-[#A53025] rounded text-[#A53025] text-[13px]">
          {error}
        </div>
      )}

      {done && (
        <div className="p-4 bg-[#E4EDE0] border border-[#4A6B3D] rounded">
          <div className="font-medium text-[14px] text-[#4A6B3D]">
            ✓ Applied — {done.outflows} SKU{done.outflows !== 1 ? 's' : ''} decreased, {done.inflows} SKU{done.inflows !== 1 ? 's' : ''} increased.
          </div>
          {done.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-[12px] text-[#A53025]">
              {done.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      {preview && (
        <div className="bg-white border border-[#D4D0C7] rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#D4D0C7] flex items-center justify-between">
            <div>
              <div className="font-medium text-[14px]">Preview — {preview.brand}</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mt-0.5">
                {preview.total_skus} SKUs · headers: {preview.headers_detected.sku} / {preview.headers_detected.closing}
              </div>
            </div>
            <div className="text-[11px] font-mono text-[#6B6B6B]">
              Decreased {preview.diffs.filter(d => d.change === 'outflow').length} · Increased {preview.diffs.filter(d => d.change === 'inflow').length} · Unchanged {preview.diffs.filter(d => d.change === 'no_change').length}
            </div>
          </div>

          {preview.unknown_skus.length > 0 && (
            <div className="px-5 py-3 bg-[#F5EDD6] border-b border-[#B8860B] text-[12px] text-[#8B6F1B]">
              <strong>Skipped — {preview.unknown_skus.length} SKU{preview.unknown_skus.length === 1 ? '' : 's'} not in SKU Mapping for {preview.brand}:</strong>{' '}
              <span className="font-mono">{preview.unknown_skus.join(', ')}</span>
              <div className="mt-1 text-[11px] opacity-80">
                Add them to the SKU Mapping gsheet (with brand = {preview.brand}) and re-upload to include.
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
                <tr className="font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B]">
                  <th className="text-left px-4 py-2">SKU</th>
                  <th className="text-left px-4 py-2">Product</th>
                  <th className="text-right px-4 py-2">Current</th>
                  <th className="text-right px-4 py-2">New</th>
                  <th className="text-right px-4 py-2">Δ</th>
                  <th className="text-left px-4 py-2">FEFO plan (auto-deduct oldest batches)</th>
                </tr>
              </thead>
              <tbody>
                {preview.diffs.map(d => (
                  <tr key={d.sku} className="border-b border-[#F0EDE4] align-top">
                    <td className="px-4 py-2.5 font-mono font-medium">{d.sku}</td>
                    <td className="px-4 py-2.5 text-[#3D3D3D]">{d.product_name}</td>
                    <td className="px-4 py-2.5 font-mono text-right">{d.current_qty.toLocaleString()}</td>
                    <td className="px-4 py-2.5 font-mono text-right font-semibold">{d.new_qty.toLocaleString()}</td>
                    <td className={`px-4 py-2.5 font-mono text-right font-semibold ${d.delta < 0 ? 'text-[#A53025]' : d.delta > 0 ? 'text-[#4A6B3D]' : 'text-[#6B6B6B]'}`}>
                      {d.delta > 0 ? '+' : ''}{d.delta.toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      {d.change === 'outflow' && d.fefo_plan && d.fefo_plan.length > 0 && (
                        <div className="flex flex-col gap-0.5">
                          {d.fefo_plan.map((s, i) => (
                            <div key={i} className="text-[11px] font-mono text-[#A53025]">
                              − {s.deduct.toLocaleString()} from <strong>{s.batch_number}</strong>
                              {s.expiry_date && <span className="text-[#6B6B6B]"> (exp {s.expiry_date})</span>}
                              {' '}→ {s.new_remaining.toLocaleString()}
                            </div>
                          ))}
                          {d.short_by > 0 && (
                            <div className="text-[10px] font-mono text-[#A53025]">
                              ⚠ Short by {d.short_by.toLocaleString()} — no batch left to cover this
                            </div>
                          )}
                        </div>
                      )}
                      {d.change === 'inflow' && (
                        <div className="text-[11px] font-mono text-[#4A6B3D]">
                          +{d.delta.toLocaleString()} → add a new batch manually in <strong>Batches</strong> later
                        </div>
                      )}
                      {d.change === 'no_change' && <span className="text-[#6B6B6B]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-4 border-t border-[#D4D0C7] flex items-center justify-end gap-3">
            <button
              onClick={runApply}
              disabled={applying}
              className="px-4 py-2 bg-[#1A1A1A] text-white rounded text-[13px] disabled:opacity-50 shrink-0"
            >{applying ? 'Applying…' : 'Apply Changes'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Step({ n, title, disabled, children }: { n: number; title: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <div className={`bg-white border border-[#D4D0C7] rounded-lg p-5 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#1A1A1A] text-white text-[11px] font-mono">{n}</span>
        <span className="font-medium text-[14px]">{title}</span>
      </div>
      {children}
    </div>
  )
}
