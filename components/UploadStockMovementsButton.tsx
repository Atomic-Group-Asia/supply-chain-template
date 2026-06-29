'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

const BRANDS = ['Nattome', 'NattomeSG', 'Heartio', 'HeartioSG', 'TPD', 'HJT', 'HooHoo', 'Stonecare']

export function UploadStockMovementsButton() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [showBrandPicker, setShowBrandPicker] = useState(false)
  const [selectedBrand, setSelectedBrand] = useState<string>('Nattome')
  const router = useRouter()

  function startUpload() {
    setShowBrandPicker(true)
  }

  function pickBrandAndUpload() {
    setShowBrandPicker(false)
    fileInputRef.current?.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setMessage('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('brand', selectedBrand)
      const res = await fetch('/api/stock-movements/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setMessage(`Error: ${data.error}`); return }
      setMessage(`✓ Uploaded ${data.inserted} ${selectedBrand} movements`)
      router.refresh()
    } catch (e: any) {
      setMessage(`Error: ${e.message}`)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        <button
          onClick={startUpload}
          disabled={uploading}
          className="bg-[#1A1A1A] text-[#FAFAF7] px-3.5 py-2 rounded text-[13px] hover:bg-[#C8432C] transition-colors disabled:opacity-50"
        >
          {uploading ? 'Uploading...' : '↑ Upload Excel'}
        </button>
        {message && <div className="text-[11px] font-mono text-[#6B6B6B]">{message}</div>}
      </div>

      {showBrandPicker && (
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
          onClick={() => setShowBrandPicker(false)}
        >
          <div
            style={{ backgroundColor: 'white', borderRadius: '8px', padding: '32px', width: '100%', maxWidth: '480px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-2 font-semibold">Step 1 of 2</div>
            <h2 className="text-xl font-medium mb-2">Select brand for this upload</h2>
            <p className="text-sm text-[#6B6B6B] mb-5">All movements in the Excel will be tagged with this brand.</p>
            <select
              value={selectedBrand}
              onChange={e => setSelectedBrand(e.target.value)}
              className="w-full px-3 py-2 border border-[#D4D0C7] rounded text-[13px] bg-white mb-5"
            >
              {BRANDS.map(b => <option key={b}>{b}</option>)}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowBrandPicker(false)} className="px-3.5 py-2 rounded text-[13px] text-[#6B6B6B] hover:bg-[#FAFAF7]">Cancel</button>
              <button onClick={pickBrandAndUpload} className="bg-[#1A1A1A] text-[#FAFAF7] px-4 py-2 rounded text-[13px] hover:bg-[#C8432C]">Choose Excel file →</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}