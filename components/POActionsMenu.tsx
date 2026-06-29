'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

export function POActionsMenu({ po }: { po: any }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Compute menu position relative to the trigger button (viewport coords).
  useEffect(() => {
    if (!open) return
    function place() {
      const r = triggerRef.current?.getBoundingClientRect()
      if (!r) return
      setCoords({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  async function copy() {
    setOpen(false)
    const res = await fetch(`/api/purchase-orders/${po.id}/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drafted_by: 'Jun Ye' }),
    })
    const json = await res.json()
    if (!res.ok) { alert(json.error || 'Copy failed'); return }
    router.push(`/purchase-orders/${json.id}`)
  }

  async function remove() {
    setOpen(false)
    const label = po.po_number || po.id
    if (!confirm(`Delete ${label}?\n\nThis cannot be undone. All line items will be removed too.`)) return
    const res = await fetch(`/api/purchase-orders/${po.id}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { alert(json.error || 'Delete failed'); return }
    router.refresh()
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        onClick={() => router.push(`/purchase-orders/${po.id}`)}
        className="px-2.5 py-1 border border-[#1A1A1A] text-[#1A1A1A] rounded text-[11px] hover:bg-[#FAFAF7]"
      >
        View
      </button>
      <button
        ref={triggerRef}
        onClick={() => setOpen(v => !v)}
        className="px-2 py-1 border border-[#D4D0C7] rounded text-[11px] hover:bg-[#FAFAF7]"
        aria-label="More actions"
      >
        ▾
      </button>
      {open && coords && typeof window !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.top,
            right: coords.right,
            zIndex: 10000,
            background: 'white',
            border: '1px solid #D4D0C7',
            borderRadius: '4px',
            minWidth: '140px',
            padding: '4px 0',
            boxShadow: '0 6px 18px rgba(0,0,0,0.10)',
          }}
        >
          <MenuItem onClick={() => { setOpen(false); router.push(`/purchase-orders/${po.id}`) }} icon="👁">View detail</MenuItem>
          <MenuItem onClick={() => { setOpen(false); router.push(`/purchase-orders/${po.id}?edit=1`) }} icon="✎">Edit</MenuItem>
          <MenuItem onClick={copy} icon="📋">Copy</MenuItem>
          <MenuItem
            onClick={() => { setOpen(false); window.open(`/purchase-orders/${po.id}/print`, '_blank') }}
            icon="📄"
          >
            PDF File
          </MenuItem>
          <div style={{ borderTop: '1px solid #F0EDE4', margin: '4px 0' }} />
          <MenuItem onClick={remove} icon="🗑" danger>Delete</MenuItem>
        </div>,
        document.body,
      )}
    </div>
  )
}

function MenuItem({ onClick, icon, children, danger }: { onClick: () => void; icon: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-1.5 text-left text-[12px] hover:bg-[#FAFAF7] flex items-center gap-2 ${danger ? 'text-[#A53025] hover:bg-[#F5DEDA]' : ''}`}
    >
      <span className="text-[12px] w-4 text-center opacity-60">{icon}</span>
      <span>{children}</span>
    </button>
  )
}
