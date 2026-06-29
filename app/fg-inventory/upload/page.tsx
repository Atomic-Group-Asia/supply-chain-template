import Link from 'next/link'
import { UploadDailyStockClient } from '@/components/UploadDailyStockClient'

export const dynamic = 'force-dynamic'

const BRAND_OPTIONS = [
  { code: 'Nattome', label: 'Nattome (MY)' },
  { code: 'NattomeSG', label: 'Nattome SG' },
  { code: 'Heartio', label: 'Heartio (MY)' },
  { code: 'HeartioSG', label: 'Heartio SG' },
  { code: 'TPD', label: 'TPD' },
  { code: 'HJT', label: 'HJT' },
  { code: 'HooHoo', label: 'Hoo Hoo' },
  { code: 'Stonecare', label: 'Stonecare' },
]

export default function FGInventoryUploadPage() {
  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <Link href="/fg-inventory" className="hover:underline">FG Inventory</Link> · <strong className="text-[#1A1A1A]">Upload Daily Stock</strong>
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1100px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">Daily reconcile</div>
            <h1 className="text-3xl font-medium tracking-tight">Upload Daily Stock</h1>
            <div className="text-sm text-[#6B6B6B] mt-1">
              Excel with <code className="text-[12px] bg-[#FAFAF7] px-1.5 py-0.5 rounded">SKU</code> and <code className="text-[12px] bg-[#FAFAF7] px-1.5 py-0.5 rounded">Closing Balance</code> columns. FEFO auto-deducts oldest batches first; new stock prompts for expiry.
            </div>
          </div>
          <Link href="/fg-inventory" className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[13px] hover:bg-[#FAFAF7]">
            ← Back
          </Link>
        </div>

        <UploadDailyStockClient brandOptions={BRAND_OPTIONS} />
      </div>
    </div>
  )
}
