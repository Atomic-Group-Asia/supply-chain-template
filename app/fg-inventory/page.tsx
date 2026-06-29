import Link from 'next/link'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase'
import { FGInventoryTable } from '@/components/FGInventoryTable'
import { readFGIncomingByBrandSku, readBatchesByBrandSku, readSkuMapping, readDailyStockAllBrands, readFGIncomingETAByBrandSku } from '@/lib/fg-inventory'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// FG Inventory shows all live brands across MY + SG (broader than the
// VISIBLE_BRANDS set used by Purchase Decisions / Alerts / Dashboard).
const FG_INVENTORY_BRANDS = new Set<string>([
  'Nattome', 'NattomeSG',
  'Heartio', 'HeartioSG',
  'TPD', 'HooHoo', 'HJT', 'Stonecare',
])

const key = (brand: string, sku: string) => `${brand}::${sku}`

export default async function FGInventoryPage() {
  const fetchedAt = new Date()
  const h = await headers()
  const isViewer = h.get('x-user-role') === 'viewer'

  // Source of truth split:
  //   - Closing stock → batches table (FEFO model)
  //   - Product name + category → SKU Mapping gsheet (master list,
  //     broader than the Supabase products table)
  //   - Incoming → open POs
  const [
    { data: dbProducts },
    { data: dbBom },
    { data: dbSuppliers },
    { data: dbPackaging },
    incomingMap,
    incomingEtaMap,
    batchesByKey,
    mapping,
    dailyStockMap,
    { data: uploadLogs },
  ] = await Promise.all([
    supabaseAdmin.from('products').select('*'),
    supabaseAdmin.from('bom').select('*'),
    supabaseAdmin.from('suppliers').select('*').order('supplier_code'),
    supabaseAdmin.from('packaging').select('*').order('packaging_code'),
    readFGIncomingByBrandSku(),
    readFGIncomingETAByBrandSku(),
    readBatchesByBrandSku(),
    readSkuMapping(),
    // Read Available from daily_stock_current (populated by Excel/CSV
    // upload using the "Closing Balance" column). SKUs that have never
    // been uploaded show as 0.
    readDailyStockAllBrands(),
    // Last upload per brand for "last refreshed" badge
    supabaseAdmin
      .from('stock_upload_log')
      .select('brand, uploaded_at, uploaded_by')
      .order('uploaded_at', { ascending: false })
      .limit(50),
  ])

  // Reduce to one row per brand (the most recent)
  const lastUploadByBrand = new Map<string, { uploaded_at: string; uploaded_by: string | null }>()
  for (const r of (uploadLogs || [])) {
    if (!lastUploadByBrand.has(r.brand)) {
      lastUploadByBrand.set(r.brand, { uploaded_at: r.uploaded_at, uploaded_by: r.uploaded_by })
    }
  }

  // Use SKU Mapping as the master list. Filter to visible brands only.
  const visibleMapping = mapping.filter(m => m.brand && FG_INVENTORY_BRANDS.has(m.brand))

  const items = visibleMapping.map(m => {
    const k = key(m.brand, m.sku)
    const batches = batchesByKey.get(k) || []
    // Opening = whatever the latest daily upload stored. Batches don't
    // drive this value; they're a separate expiry/audit ledger.
    const closing = dailyStockMap.get(k) || 0
    const earliestExpiry = batches.length > 0 ? batches[0].expiry_date : null
    const incoming = incomingMap.get(k) || 0
    const incomingEta = incomingEtaMap.get(k) || null
    // Analytics lookup tolerates brand-name variants like 'Hoo Hoo' vs 'HooHoo'.
    // (Master_Inventory gsheet analytics — Min / Restock / Avg / Days
    // Cov / Status / Alert / Notes — no longer fetched. Purchase Decisions
    // page computes the same metrics on-the-fly from real stock_movements
    // data, so this gsheet read is redundant.)
    return {
      sku: m.sku,
      brand: m.brand,
      product_name: m.product_name || m.sku,
      category: m.category || 'Others',
      closing_stock: closing,
      incoming,
      committed: 0,
      // Available = Opening only (from daily upload). Incoming POs are
      // informational — they don't roll into Available until the user's
      // next daily upload picks up the new stock.
      available: closing,
      // Batch summary fields
      batch_count: batches.length,
      earliest_expiry: earliestExpiry,
      // Earliest ETA across active inbound POs (matches Incoming source)
      incoming_eta: incomingEta,
      // Legacy fields kept null for backward compat with the table type.
      min_level: null,
      restock_level: null,
      avg_monthly_sales: null,
      days_coverage: null,
      coverage_status: '',
      restock_alert: '',
      notes: '',
    }
  })

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-4 sm:px-7 py-2.5 sm:py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">FG Inventory</strong>
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7] gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">
              Live inventory · FEFO model
            </div>
            <h1 className="text-2xl sm:text-3xl font-medium tracking-tight">FG Inventory</h1>
            <div className="text-[12px] sm:text-sm text-[#6B6B6B] mt-1">
              {items.length} SKUs · sourced from batches
            </div>
            {lastUploadByBrand.size > 0 && (
              <details className="mt-2 text-[11px] font-mono text-[#6B6B6B]">
                <summary className="cursor-pointer uppercase tracking-wider text-[10px]">
                  Last upload — {lastUploadByBrand.size} brand{lastUploadByBrand.size > 1 ? 's' : ''} ▾
                </summary>
                <div className="mt-1.5 flex gap-2 flex-wrap">
                  {Array.from(lastUploadByBrand.entries()).map(([b, info]) => (
                    <span key={b} className="inline-flex items-center gap-1">
                      <strong className="text-[#1A1A1A]">{b}</strong>
                      <span>{new Date(info.uploaded_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Kuala_Lumpur' })}</span>
                    </span>
                  ))}
                </div>
              </details>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {!isViewer && (
              <Link href="/fg-inventory/upload" className="px-3 py-1.5 bg-[#1A1A1A] text-white rounded text-[12px] sm:text-[13px] hover:bg-[#C8432C] transition-colors whitespace-nowrap">
                ↑ Upload
              </Link>
            )}
          </div>
        </div>

        <FGInventoryTable
          items={items as any}
          bom={dbBom || []}
          suppliers={dbSuppliers || []}
          packaging={dbPackaging || []}
        />
      </div>
    </div>
  )
}
