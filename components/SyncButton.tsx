'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function SyncButton({ entity = 'suppliers' }: { entity?: string }) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')

  async function sync() {
    setSyncing(true); setMessage('')
    try {
      const res = await fetch(`/api/sync/${entity}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setMessage(`Error: ${data.error}`); return }
      let msg = `+${data.added} · ${data.updated} updated · -${data.deleted}`
      if (data.skippedDelete?.length) msg += ` · ${data.skippedDelete.length} skipped`
      if (data.errors?.length) msg += ` · ${data.errors.length} errors`
      setMessage(msg)
      router.refresh()
    } catch (e: any) { setMessage(`Error: ${e.message}`) }
    finally { setSubmitting() }
    function setSubmitting() { setSyncing(false) }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={sync}
        disabled={syncing}
        className="bg-white border border-[#D4D0C7] px-3.5 py-2 rounded text-[13px] hover:border-[#1A1A1A] transition-colors disabled:opacity-50"
      >
        {syncing ? 'Syncing...' : 'Sync from GSheet'}
      </button>
      {message && <div className="text-[11px] text-[#6B6B6B] font-mono">{message}</div>}
    </div>
  )
}