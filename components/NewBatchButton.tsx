'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { BatchModal } from './BatchModal'
import { SkuSearchInput } from './SkuSearchInput'

type Product = { sku: string; product_name: string; brand: string }

export function NewBatchButton({ products }: { products: Product[] }) {
  const router = useRouter()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sku, setSku] = useState('')
  // Brand explicitly captured from picker — needed because the same SKU
  // can exist under multiple warehouses (e.g. Nattome MY vs NattomeSG).
  const [pickedBrand, setPickedBrand] = useState<string>('')

  const picked = pickedBrand && sku
    ? products.find(p => p.sku === sku.trim() && p.brand === pickedBrand)
    : null
  const showModal = pickerOpen && !!picked

  function resetPicker() {
    setSku('')
    setPickedBrand('')
  }

  return (
    <>
      <button
        onClick={() => { resetPicker(); setPickerOpen(true) }}
        className="px-3.5 py-2 bg-[#1A1A1A] text-white rounded text-[13px] hover:bg-[#C8432C] transition-colors"
      >
        + New Batch
      </button>

      {pickerOpen && !showModal && (
        <div onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} className="bg-white rounded-lg shadow-2xl w-full max-w-[460px] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-[#D4D0C7] flex justify-between items-center">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1">Step 1 of 2</div>
                <h2 className="text-[18px] font-medium">Pick a SKU</h2>
              </div>
              <button onClick={() => setPickerOpen(false)} className="text-[24px] text-[#6B6B6B] leading-none px-2">×</button>
            </div>
            <div className="px-6 py-5">
              <SkuSearchInput
                value={sku}
                onChange={(v) => { setSku(v); setPickedBrand('') }}
                onSelect={(p) => { setSku(p.sku); setPickedBrand(p.brand || '') }}
                selectedBrand={pickedBrand || undefined}
                products={products}
                placeholder="Type SKU or product name…"
              />
              <div className="mt-3 text-[11px] text-[#6B6B6B] font-mono">
                Tip: if the same SKU exists in multiple warehouses (e.g. Nattome MY vs NattomeSG), you'll be asked to pick which one. Each warehouse has its own batches.
              </div>
            </div>
            <div className="px-6 py-3 border-t border-[#D4D0C7] flex justify-end">
              <button
                onClick={() => setPickerOpen(false)}
                className="px-3 py-1.5 text-[#6B6B6B] text-[13px]"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showModal && picked && (
        <BatchModal
          batch={null}
          brand={picked.brand}
          sku={picked.sku}
          onClose={() => { setPickerOpen(false); resetPicker() }}
          onSaved={() => { setPickerOpen(false); resetPicker(); router.refresh() }}
        />
      )}
    </>
  )
}
