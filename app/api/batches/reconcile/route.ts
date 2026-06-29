import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { reconcileSkuBatches } from '@/lib/batch-reconcile'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/batches/reconcile
 * body (optional): { brand?: string, sku?: string }
 *
 * If sku is given, reconciles that one SKU. Otherwise reconciles every
 * (brand, sku) pair that has at least one batch.
 *
 * Reconcile = redistribute qty_remaining across this SKU's batches so
 * that total active equals Available from WH_Summary gsheet, with FEFO
 * order (oldest deplete first).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { brand, sku } = body as { brand?: string; sku?: string }

    if (brand && sku) {
      const r = await reconcileSkuBatches(brand, sku)
      return NextResponse.json({ reconciled: r ? 1 : 0, result: r })
    }

    // Reconcile all unique (brand, sku) pairs that have batches
    const { data, error } = await supabaseAdmin
      .from('batches')
      .select('brand, sku')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const pairs = new Set<string>()
    for (const r of data || []) {
      if (r.brand && r.sku) pairs.add(`${r.brand}::${r.sku}`)
    }

    let count = 0
    const sample: any[] = []
    for (const p of pairs) {
      const [b, s] = p.split('::')
      const r = await reconcileSkuBatches(b, s, { skipCacheBust: count > 0 })
      if (r) {
        count++
        if (r.updates.length > 0 && sample.length < 10) sample.push(r)
      }
    }

    return NextResponse.json({ reconciled: count, total_pairs: pairs.size, sample })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Reconcile failed' }, { status: 500 })
  }
}
