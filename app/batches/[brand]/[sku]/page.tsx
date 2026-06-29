import Link from 'next/link'
import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { readSkuMapping, readDailyStockAllBrands } from '@/lib/fg-inventory'
import { reconcileSkuBatches } from '@/lib/batch-reconcile'
import { BatchesDetailTable } from '@/components/BatchesDetailTable'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function BatchesSkuDetailPage({
  params,
}: {
  params: Promise<{ brand: string; sku: string }>
}) {
  const { brand: brandRaw, sku: skuRaw } = await params
  const brand = decodeURIComponent(brandRaw)
  const sku = decodeURIComponent(skuRaw)

  // Auto-reconcile on load — keeps qty_remaining in sync with the current
  // gsheet Available even if a batch was added before the API hook existed
  // or the gsheet number was changed externally.
  try { await reconcileSkuBatches(brand, sku) } catch {}

  const [{ data: batches }, mapping, wh] = await Promise.all([
    supabaseAdmin
      .from('batches')
      .select('*')
      .eq('brand', brand)
      .eq('sku', sku)
      .order('expiry_date', { ascending: true, nullsFirst: false }),
    readSkuMapping(),
    readDailyStockAllBrands(),
  ])

  const meta = mapping.find(m => m.sku === sku && m.brand === brand)
  if (!batches) notFound()

  const available = wh.get(`${brand}::${sku}`) || 0
  const recorded = batches.reduce((s, b) => s + (Number(b.qty) || 0), 0)
  const activeTotal = batches
    .filter(b => b.status === 'active' && (Number(b.qty_remaining) || 0) > 0)
    .reduce((s, b) => s + (Number(b.qty_remaining) || 0), 0)

  const productName = meta?.product_name || sku
  const category = meta?.category || ''

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <Link href="/batches" className="hover:underline">Batches</Link> · <strong className="text-[#1A1A1A]">{sku}</strong>
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">
              {brand}{category ? ` · ${category}` : ''}
            </div>
            <h1 className="text-3xl font-medium tracking-tight">{productName}</h1>
            <div className="text-sm text-[#6B6B6B] mt-1 font-mono">{sku}</div>
          </div>
          <Link
            href="/batches"
            className="px-3.5 py-1.5 border border-[#D4D0C7] rounded text-[13px] hover:bg-[#FAFAF7]"
          >← Back to all SKUs</Link>
        </div>

        {/* Summary band */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <SummaryCard label="Available (gsheet)" value={available.toLocaleString()} tone="primary" />
          <SummaryCard label="Recorded (sum qty)" value={recorded.toLocaleString()} />
          <SummaryCard label="Active total" value={activeTotal.toLocaleString()} tone={activeTotal === available ? 'ok' : 'warn'} />
          <SummaryCard
            label="Reconcile status"
            value={
              recorded === 0 ? 'No batches' :
              activeTotal === available ? 'Balanced' :
              activeTotal < available ? `Gap +${(available - activeTotal).toLocaleString()}` :
              `Over ${(activeTotal - available).toLocaleString()}`
            }
            tone={
              recorded === 0 ? 'muted' :
              activeTotal === available ? 'ok' :
              'warn'
            }
          />
        </div>

        <BatchesDetailTable batches={batches} brand={brand} sku={sku} />
      </div>
    </div>
  )
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: 'primary' | 'ok' | 'warn' | 'muted' }) {
  const colorMap: Record<string, string> = {
    primary: 'text-[#1A1A1A]',
    ok: 'text-[#4A6B3D]',
    warn: 'text-[#C8432C]',
    muted: 'text-[#6B6B6B]',
  }
  const valueColor = tone ? colorMap[tone] : 'text-[#1A1A1A]'
  return (
    <div className="bg-white border border-[#D4D0C7] rounded p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">{label}</div>
      <div className={`font-mono text-xl font-semibold mt-0.5 ${valueColor}`}>{value}</div>
    </div>
  )
}
