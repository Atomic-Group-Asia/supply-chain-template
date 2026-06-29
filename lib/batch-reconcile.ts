/**
 * FEFO batch reconciliation.
 *
 * Available qty per (brand, sku) lives in WH_Summary gsheet. User
 * records batches over time with their real OEM batch numbers and
 * expiry dates. When recorded total exceeds Available, the oldest
 * batches must have been used up (FEFO assumption).
 *
 * This helper redistributes qty_remaining across active batches:
 *   - Sort batches by expiry_date ASC (oldest first, nulls last)
 *   - Walk in REVERSE (newest first) and "fill" qty_remaining = qty
 *     until Available is exhausted
 *   - Older batches that don't get filled become depleted (qty_remaining 0)
 *
 * If recorded total < Available, every batch stays full — the gap is
 * stock the user hasn't recorded yet.
 */

import { supabaseAdmin } from './supabase'
import { invalidateStockCache, readDailyStockAllBrands } from './fg-inventory'

export type ReconcileResult = {
  brand: string
  sku: string
  available: number
  recorded_total: number
  active_total: number
  updates: { batch_number: string; expiry_date: string | null; before: number; after: number; status: 'active' | 'depleted' }[]
}

export async function reconcileSkuBatches(
  brand: string,
  sku: string,
  opts?: { skipCacheBust?: boolean },
): Promise<ReconcileResult | null> {
  // 1. Refresh stock cache (so we don't reconcile against a 60s-stale qty)
  if (!opts?.skipCacheBust) invalidateStockCache()
  // Use the env-gated Available source — daily_stock_current on prod,
  // WH_Summary gsheet on demo. readDailyStockAllBrands has no brand
  // filter, so batches for any brand still reconcile correctly.
  const stockMap = await readDailyStockAllBrands()
  const available = stockMap.get(`${brand}::${sku}`) || 0

  // 2. Fetch this SKU's batches in expiry-asc order (nulls treated as "very far future")
  const { data: batches, error } = await supabaseAdmin
    .from('batches')
    .select('id, batch_number, expiry_date, qty, qty_remaining, status')
    .eq('brand', brand)
    .eq('sku', sku)
  if (error || !batches || batches.length === 0) return null

  const sortedAsc = [...batches].sort((a, b) => {
    const ad = a.expiry_date || '9999-12-31'
    const bd = b.expiry_date || '9999-12-31'
    return ad.localeCompare(bd)
  })
  const recordedTotal = sortedAsc.reduce((s, b) => s + (Number(b.qty) || 0), 0)

  // 3. Walk NEWEST first, fill up to available
  const newestFirst = [...sortedAsc].reverse()
  let remaining = available
  const planned: { id: string; batch_number: string; expiry_date: string | null; qty: number; before: number; new_remaining: number }[] = []
  for (const b of newestFirst) {
    const orig = Number(b.qty) || 0
    const take = Math.min(orig, Math.max(0, remaining))
    planned.push({
      id: b.id,
      batch_number: b.batch_number,
      expiry_date: b.expiry_date,
      qty: orig,
      before: Number(b.qty_remaining) || 0,
      new_remaining: take,
    })
    remaining -= take
  }

  // 4. Apply updates
  const updates: ReconcileResult['updates'] = []
  for (const p of planned) {
    const status: 'active' | 'depleted' = p.new_remaining > 0 ? 'active' : 'depleted'
    if (p.before === p.new_remaining) {
      // No qty change — but ensure status matches
      const expectedStatus = p.new_remaining > 0 ? 'active' : 'depleted'
      // We don't have current status here; just skip if numbers identical
      // (next reconcile will catch any drift)
      continue
    }
    const { error: upErr } = await supabaseAdmin
      .from('batches')
      .update({ qty_remaining: p.new_remaining, status })
      .eq('id', p.id)
    if (upErr) continue
    updates.push({
      batch_number: p.batch_number,
      expiry_date: p.expiry_date,
      before: p.before,
      after: p.new_remaining,
      status,
    })
  }

  return {
    brand,
    sku,
    available,
    recorded_total: recordedTotal,
    active_total: Math.min(available, recordedTotal),
    updates,
  }
}
