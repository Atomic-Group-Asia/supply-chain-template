'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Line = {
  id: string
  sku: string | null
  product_name: string
  qty: number
  received_qty?: number
  uom: string
}

type ConsumptionPreviewRow = {
  fg_sku: string
  fg_delta: number
  packaging_code: string
  packaging_name: string
  qty_per_unit: number
  consume_qty: number
  current_stock: number
  shortfall: number
}

export function PODetailActions({ po }: { po: any }) {
  const router = useRouter()
  const [viewer, setViewer] = useState<string>('Syuen')
  const [busy, setBusy] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
  const [showPay, setShowPay] = useState(false)
  const [payAmount, setPayAmount] = useState<number>(0)
  const [showReceive, setShowReceive] = useState(false)
  const [receiveLines, setReceiveLines] = useState<Record<string, number>>({})
  const [preview, setPreview] = useState<ConsumptionPreviewRow[]>([])
  const [previewing, setPreviewing] = useState(false)

  // Auto-fetch consumption preview whenever the receive qty changes (FG POs only).
  useEffect(() => {
    if (!showReceive || po.po_type !== 'FG') { setPreview([]); return }
    const lines = (po.items || []).map((it: Line) => ({
      id: it.id,
      received_qty: receiveLines[it.id] ?? Number(it.received_qty || 0),
    }))
    setPreviewing(true)
    const ctrl = new AbortController()
    fetch(`/api/purchase-orders/${po.id}/consumption-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
      signal: ctrl.signal,
    })
      .then(r => r.json())
      .then(j => { if (!ctrl.signal.aborted) setPreview(j.preview || []) })
      .catch(() => {})
      .finally(() => { if (!ctrl.signal.aborted) setPreviewing(false) })
    return () => ctrl.abort()
  }, [showReceive, receiveLines, po])

  const total = Number(po.total_amount || 0)
  const paid = Number(po.paid_amount || 0)
  const outstanding = Math.max(0, total - paid)

  async function act(action: 'approve' | 'reject' | 'copy' | 'mark_received' | 'record_payment') {
    if (action === 'approve' && viewer !== 'Syuen') {
      alert('Only Syuen can approve POs')
      return
    }
    setBusy(true)
    try {
      if (action === 'record_payment') {
        if (!payAmount || payAmount <= 0) { alert('Enter amount > 0'); setBusy(false); return }
        const res = await fetch(`/api/purchase-orders/${po.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'record_payment', amount: payAmount, actor: viewer }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed')
        router.refresh()
        setShowPay(false)
        setPayAmount(0)
        return
      }
      if (action === 'copy') {
        const res = await fetch(`/api/purchase-orders/${po.id}/copy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ drafted_by: viewer }) })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Copy failed')
        router.push(`/purchase-orders/${json.id}`)
        return
      }
      if (action === 'mark_received') {
        // Build lines payload with current modal values (absolute received_qty per line)
        const lines = (po.items || []).map((it: Line) => ({
          id: it.id,
          received_qty: receiveLines[it.id] ?? Number(it.received_qty || 0),
        }))
        const totalNewReceived = lines.reduce((s: number, ln: { received_qty: number }) => s + Number(ln.received_qty || 0), 0)
        if (totalNewReceived <= 0) {
          alert('Enter at least one line qty > 0')
          setBusy(false)
          return
        }
        const res = await fetch(`/api/purchase-orders/${po.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'mark_received', lines, actor: viewer }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed')
        router.refresh()
        setShowReceive(false)
        return
      }
      const res = await fetch(`/api/purchase-orders/${po.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, actor: viewer, reason: action === 'reject' ? reason : undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      router.refresh()
      setShowReject(false)
    } catch (e: any) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  function openReceiveModal() {
    // Pre-fill with REMAINING qty per line (ordered − already received)
    const next: Record<string, number> = {}
    for (const it of (po.items || []) as Line[]) {
      const already = Number(it.received_qty || 0)
      const remaining = Math.max(0, Number(it.qty || 0) - already)
      next[it.id] = already + remaining // final absolute (full)
    }
    setReceiveLines(next)
    setShowReceive(true)
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <label className="text-[10px] uppercase tracking-wider font-mono text-[#6B6B6B]">Acting as</label>
        <select
          value={viewer}
          onChange={e => setViewer(e.target.value)}
          className="px-2 py-1 border border-[#D4D0C7] rounded text-[12px] bg-white"
        >
          <option>Grace</option>
          <option>Jun Ye</option>
          <option>Syuen</option>
        </select>
      </div>
      <div className="flex gap-2">
        <a
          href={`/purchase-orders/${po.id}/print`}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 border border-[#1A1A1A] text-[#1A1A1A] rounded text-[12px] hover:bg-[#FAFAF7]"
        >
          📄 PDF
        </a>
        <button
          onClick={() => act('copy')}
          disabled={busy}
          className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[12px] hover:bg-[#FAFAF7] disabled:opacity-50"
        >
          📋 Copy
        </button>
        {(po.status === 'pending' || po.status === 'approved') && (
          <a
            href={`/purchase-orders/${po.id}?edit=1`}
            className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[12px] hover:bg-[#FAFAF7]"
          >
            ✎ Edit
          </a>
        )}
        {po.status === 'pending' && (
          <>
            <button
              onClick={() => setShowReject(true)}
              disabled={busy}
              className="px-3 py-1.5 border border-[#C8432C] text-[#C8432C] rounded text-[12px] hover:bg-[#F5DEDA]"
            >
              Reject
            </button>
            <button
              onClick={() => act('approve')}
              disabled={busy || viewer !== 'Syuen'}
              title={viewer !== 'Syuen' ? 'Only Syuen can approve' : ''}
              className="px-3 py-1.5 bg-[#1A1A1A] text-white rounded text-[12px] hover:bg-black disabled:opacity-40"
            >
              ✓ Approve
            </button>
          </>
        )}
        {(po.status === 'approved' || po.status === 'partial_received') && (
          <button
            onClick={openReceiveModal}
            disabled={busy}
            className="px-3 py-1.5 border border-[#1A1A1A] rounded text-[12px] hover:bg-[#FAFAF7]"
          >
            📦 Mark Received
          </button>
        )}
        {(po.status === 'received' || po.status === 'partial_received') && (
          <button
            onClick={async () => {
              if (!confirm('Revert this PO back to Approved?\n\nThis will:\n• Reset received_qty on all lines to 0\n• Restore packaging stock that was auto-deducted on receipt\n• Clear the received_at / received_by audit fields\n\nThe receipt history will be lost.')) return
              setBusy(true)
              try {
                const res = await fetch(`/api/purchase-orders/${po.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ action: 'revert_receipt', actor: viewer }),
                })
                const json = await res.json()
                if (!res.ok) throw new Error(json.error || 'Revert failed')
                router.refresh()
              } catch (e: any) {
                alert(e.message)
              } finally {
                setBusy(false)
              }
            }}
            disabled={busy}
            className="px-3 py-1.5 border border-[#A87B1F] text-[#A87B1F] rounded text-[12px] hover:bg-[#FFF8E5]"
            title="Undo the receipt — moves status back to Approved"
          >
            ↶ Revert to Approved
          </button>
        )}
        {/* Record Payment button removed — payment is now per-invoice via
            the Invoices section below. Add an invoice first, then record
            payment against it. */}
      </div>

      {showPay && (
        <div className="mt-2 p-3 bg-[#E8EFE5] border border-[#4A6B3D] rounded w-full max-w-[640px]">
          <div className="flex items-center gap-2 mb-2">
            <label className="text-[11px] font-mono uppercase text-[#4A6B3D]">Pay RM:</label>
            <input
              type="number"
              step="0.01"
              value={payAmount}
              onChange={e => setPayAmount(Number(e.target.value))}
              className="px-2 py-1 border border-[#4A6B3D] rounded text-[12px] bg-white w-[160px]"
            />
            <span className="text-[10px] text-[#6B6B6B]">
              Outstanding: <span className="sensitive">RM {outstanding.toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span> · paid <span className="sensitive">RM {paid.toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
            </span>
          </div>
          <div className="flex gap-1.5 mb-2">
            <span className="text-[10px] font-mono uppercase text-[#6B6B6B] self-center mr-1">Quick fill:</span>
            <QuickBtn label="30% deposit" onClick={() => setPayAmount(Math.round(total * 0.3 * 100) / 100)} />
            <QuickBtn label="50%" onClick={() => setPayAmount(Math.round(total * 0.5 * 100) / 100)} />
            <QuickBtn label="Balance" onClick={() => setPayAmount(outstanding)} />
            <QuickBtn label="Full" onClick={() => setPayAmount(total)} />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => act('record_payment')}
              disabled={busy}
              className="px-3 py-1.5 bg-[#4A6B3D] text-white rounded text-[12px] hover:bg-[#3A5530]"
            >
              Confirm Payment
            </button>
            <button
              onClick={() => { setShowPay(false); setPayAmount(0) }}
              className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[12px] bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showReceive && (
        <div className="mt-2 p-3 bg-[#FAFAF7] border border-[#1A1A1A] rounded w-full max-w-[720px]">
          <div className="font-medium text-[13px] mb-2">Mark Received — enter qty received per line</div>
          <div className="text-[10px] text-[#6B6B6B] mb-2">
            Default is the full ordered qty. Lower it for partial deliveries — system will mark as <strong>Partial Received</strong> until all lines are fully received.
          </div>
          <table className="w-full text-[12px] mb-3">
            <thead className="text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
              <tr>
                <th className="text-left py-1">SKU</th>
                <th className="text-left py-1">Product</th>
                <th className="text-right py-1">Ordered</th>
                <th className="text-right py-1">Already received</th>
                <th className="text-right py-1">Total received (this submission)</th>
              </tr>
            </thead>
            <tbody>
              {((po.items || []) as Line[]).map(it => {
                const already = Number(it.received_qty || 0)
                const ordered = Number(it.qty || 0)
                const val = receiveLines[it.id] ?? already + Math.max(0, ordered - already)
                const remaining = Math.max(0, ordered - val)
                return (
                  <tr key={it.id} className="border-t border-[#F0EDE4]">
                    <td className="py-1.5 font-mono text-[11px] text-[#C8432C]">{it.sku || '—'}</td>
                    <td className="py-1.5">{it.product_name}</td>
                    <td className="py-1.5 text-right font-mono">{ordered.toLocaleString()} {it.uom}</td>
                    <td className="py-1.5 text-right font-mono text-[#6B6B6B]">{already.toLocaleString()}</td>
                    <td className="py-1.5 text-right">
                      <input
                        type="number"
                        min={already}
                        max={ordered}
                        value={val}
                        onChange={e => setReceiveLines(prev => ({ ...prev, [it.id]: Math.max(0, Number(e.target.value) || 0) }))}
                        className="px-2 py-1 border border-[#D4D0C7] rounded text-[11px] w-[90px] text-right font-mono"
                      />
                      {remaining > 0 && <div className="text-[9px] text-[#A87B1F] mt-0.5">{remaining.toLocaleString()} remaining</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {po.po_type === 'FG' && (
            <div className="mb-3 p-2.5 bg-[#FFF5F1] border border-[#E8D4CC] rounded">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#6B6B6B] mb-1.5">
                Packaging that will be consumed (auto-deduct via BOM)
              </div>
              {previewing && <div className="text-[11px] text-[#6B6B6B]">Calculating…</div>}
              {!previewing && preview.length === 0 && (
                <div className="text-[11px] text-[#6B6B6B]">
                  No packaging will be consumed (no BOM defined or no qty delta).
                </div>
              )}
              {!previewing && preview.length > 0 && (
                <table className="w-full text-[11px]">
                  <thead className="text-[9px] uppercase tracking-wider text-[#6B6B6B] font-mono">
                    <tr>
                      <th className="text-left py-0.5">FG</th>
                      <th className="text-left py-0.5">Packaging</th>
                      <th className="text-right py-0.5">Per Unit</th>
                      <th className="text-right py-0.5">Consume</th>
                      <th className="text-right py-0.5">On Hand</th>
                      <th className="text-right py-0.5">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((p, i) => {
                      const after = p.current_stock - p.consume_qty
                      const short = after < 0
                      return (
                        <tr key={i} className="border-t border-[#E8D4CC]">
                          <td className="py-1 font-mono text-[10px] text-[#C8432C]">{p.fg_sku}</td>
                          <td className="py-1">
                            <a href={`/packaging/${encodeURIComponent(p.packaging_code)}`} target="_blank" rel="noreferrer" className="text-[#1A1A1A] hover:underline">
                              {p.packaging_name}
                            </a>
                            <span className="text-[#6B6B6B] font-mono text-[10px] ml-1">({p.packaging_code})</span>
                          </td>
                          <td className="py-1 text-right font-mono text-[#6B6B6B]">{p.qty_per_unit}</td>
                          <td className="py-1 text-right font-mono text-[#C8432C]">−{p.consume_qty.toLocaleString()}</td>
                          <td className="py-1 text-right font-mono text-[#6B6B6B]">{p.current_stock.toLocaleString()}</td>
                          <td className={`py-1 text-right font-mono font-semibold ${short ? 'text-[#A53025]' : 'text-[#4A6B3D]'}`}>
                            {after.toLocaleString()}{short ? ' ⚠' : ''}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
              {!previewing && preview.some(p => p.current_stock - p.consume_qty < 0) && (
                <div className="text-[10px] text-[#A53025] mt-1.5">
                  ⚠ Some packaging will go negative. You can still confirm — the consumption is real, but please reconcile actual stock counts soon.
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => act('mark_received')}
              disabled={busy}
              className="px-3 py-1.5 bg-[#1A1A1A] text-white rounded text-[12px] hover:bg-black"
            >
              Save received qty
            </button>
            <button
              onClick={() => setShowReceive(false)}
              className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[12px] bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {showReject && (
        <div className="flex items-center gap-2 mt-2 p-2 bg-[#F5DEDA] border border-[#A53025] rounded">
          <label className="text-[11px] font-mono uppercase text-[#A53025]">Reason:</label>
          <input
            type="text"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Price too high"
            className="px-2 py-1 border border-[#A53025] rounded text-[12px] bg-white w-[240px]"
          />
          <button
            onClick={() => act('reject')}
            disabled={busy}
            className="px-2.5 py-1 bg-[#C8432C] text-white rounded text-[11px] hover:bg-[#A53025]"
          >
            Confirm
          </button>
          <button
            onClick={() => setShowReject(false)}
            className="px-2.5 py-1 border border-[#D4D0C7] rounded text-[11px] bg-white"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

function QuickBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-1 border border-[#4A6B3D] text-[#4A6B3D] rounded text-[10px] hover:bg-[#4A6B3D] hover:text-white transition-colors"
    >
      {label}
    </button>
  )
}
