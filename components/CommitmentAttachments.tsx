'use client'

import { useEffect, useState } from 'react'
import { useCurrentUser } from './CurrentUserContext'

type Attachment = {
  id: string
  file_name: string
  content_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  uploaded_at: string
}

/** File attachments for a commitment group. Supports drag/drop, file
 *  picker, and paste-from-clipboard. Image content_types render as
 *  thumbnails; other types show a generic file chip with download link. */
export function CommitmentAttachments({ groupId }: { groupId: string | null }) {
  const { current } = useCurrentUser()
  const [items, setItems] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const enabled = !!groupId

  async function refresh() {
    if (!groupId) return
    const res = await fetch(`/api/stock-commitments/group/${groupId}/attachments`)
    if (!res.ok) return
    const d = await res.json()
    setItems(d.attachments || [])
  }

  useEffect(() => { refresh() }, [groupId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadFiles(files: FileList | File[]) {
    if (!groupId) return
    setUploading(true); setError('')
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', f)
        if (current.name) fd.append('uploaded_by', current.name)
        const res = await fetch(`/api/stock-commitments/group/${groupId}/attachments`, {
          method: 'POST', body: fd,
        })
        if (!res.ok) { setError((await res.json()).error || 'Upload failed'); break }
      }
      await refresh()
    } finally { setUploading(false) }
  }

  async function remove(id: string) {
    if (!confirm('Delete this attachment?')) return
    await fetch(`/api/stock-commitments/attachments/${id}`, { method: 'DELETE' })
    refresh()
  }

  // Paste-from-clipboard handler
  useEffect(() => {
    if (!enabled) return
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const files: File[] = []
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it.kind === 'file') {
          const f = it.getAsFile()
          if (f) files.push(f)
        }
      }
      if (files.length > 0) { e.preventDefault(); uploadFiles(files) }
    }
    document.addEventListener('paste', handler)
    return () => document.removeEventListener('paste', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, groupId])

  if (!enabled) {
    return (
      <div className="text-[12px] text-[#6B6B6B] italic">
        Attachments can be added after this commitment is saved.
      </div>
    )
  }

  return (
    <div className="bg-white border border-[#D4D0C7] rounded-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#D4D0C7] flex items-center justify-between">
        <div>
          <div className="font-medium text-[14px]">Attachments</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mt-0.5">
            Proof / order screenshots / delivery notes · {items.length} file{items.length === 1 ? '' : 's'}
          </div>
        </div>
        <label className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[13px] hover:bg-[#FAFAF7] cursor-pointer">
          {uploading ? 'Uploading…' : '↑ Upload'}
          <input
            type="file"
            accept="image/*,application/pdf,.xlsx,.csv"
            multiple
            disabled={uploading}
            onChange={e => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = '' }}
            className="hidden"
          />
        </label>
      </div>

      {error && <div className="px-5 py-2 bg-[#F5DEDA] text-[#A53025] text-[12px]">{error}</div>}

      <DropZone onFiles={files => uploadFiles(files)}>
        {items.length === 0 && (
          <div className="px-5 py-8 text-center text-[12px] text-[#6B6B6B]">
            Drop a file here, click <strong>↑ Upload</strong>, or press <kbd className="px-1.5 py-0.5 border border-[#D4D0C7] rounded text-[10px]">Ctrl/Cmd + V</kbd> to paste a screenshot.
          </div>
        )}
        {items.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-5">
            {items.map(att => (
              <div key={att.id} className="border border-[#E8E5DE] rounded overflow-hidden bg-[#FAFAF7] group">
                {att.content_type?.startsWith('image/') ? (
                  <a
                    href={`/api/stock-commitments/attachments/${att.id}`}
                    target="_blank" rel="noopener noreferrer"
                  >
                    <img
                      src={`/api/stock-commitments/attachments/${att.id}`}
                      alt={att.file_name}
                      className="w-full aspect-square object-cover bg-white"
                    />
                  </a>
                ) : (
                  <a
                    href={`/api/stock-commitments/attachments/${att.id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex flex-col items-center justify-center aspect-square bg-white text-[12px] font-mono text-[#6B6B6B] hover:bg-[#FAFAF7]"
                  >
                    <div className="text-[40px] mb-2">📄</div>
                    <div>{(att.content_type || 'file').split('/').pop()?.toUpperCase()}</div>
                  </a>
                )}
                <div className="px-2.5 py-2 flex items-center justify-between gap-1.5">
                  <div className="text-[11px] truncate flex-1" title={att.file_name}>{att.file_name}</div>
                  <button
                    onClick={() => remove(att.id)}
                    className="text-[12px] text-[#A53025] opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    title="Delete"
                  >×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DropZone>
    </div>
  )
}

function DropZone({ onFiles, children }: { onFiles: (files: File[]) => void; children: React.ReactNode }) {
  const [dragging, setDragging] = useState(false)
  return (
    <div
      onDragEnter={e => { e.preventDefault(); setDragging(true) }}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault(); setDragging(false)
        const files = Array.from(e.dataTransfer.files || [])
        if (files.length > 0) onFiles(files)
      }}
      className={dragging ? 'bg-[#FFF5F1] border-2 border-dashed border-[#C8432C]' : ''}
    >
      {children}
    </div>
  )
}
