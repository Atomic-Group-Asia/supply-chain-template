'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ReconcileBatchesButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function run() {
    if (busy) return
    if (!confirm('Reconcile every SKU\'s batches against current WH_Summary Available?\n\nOldest batches will auto-deplete if recorded total exceeds Available.')) return
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch('/api/batches/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Reconcile failed')
      const changed = (json.sample || []).reduce((s: number, r: any) => s + (r.updates?.length || 0), 0)
      setResult(`Reconciled ${json.reconciled} SKUs · ${changed}+ batch qty updates`)
      router.refresh()
    } catch (e: any) {
      setResult(`Error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={run}
        disabled={busy}
        className="px-3.5 py-1.5 border border-[#D4D0C7] rounded text-[13px] hover:bg-[#FAFAF7] disabled:opacity-50"
        title="Re-run FEFO: distribute Available across batches, deplete oldest first"
      >
        {busy ? 'Reconciling…' : '⟳ Reconcile FEFO'}
      </button>
      {result && (
        <div className="text-[11px] font-mono text-[#6B6B6B] max-w-[300px] text-right">{result}</div>
      )}
    </div>
  )
}
