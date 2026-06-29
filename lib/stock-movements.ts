/**
 * Stock movements fetch helpers.
 *
 * Supabase enforces a 1000-row response cap at the project level
 * (Settings → API → max rows). stock_movements has > 1000 rows so any
 * page that needs the whole table for velocity calculations MUST
 * paginate — otherwise the brand / month chips silently drop data and
 * Avg/mo numbers come out wrong (a 6,000/mo SKU appearing as 1,000/mo
 * because half its movements were never loaded).
 */

import { supabaseAdmin } from './supabase'

export type MovementRow = {
  brand: string | null
  sku: string | null
  date_start: string | null
  out_qty: number | null
}

/**
 * Fetch every stock_movements row at or after the cutoff date (inclusive),
 * paginated in chunks of 1000. Returns the raw concatenated array.
 *
 * `cutoff` is ISO yyyy-mm-dd. Pass undefined for no lower bound.
 */
export async function fetchAllStockMovements(cutoff?: string): Promise<MovementRow[]> {
  const out: MovementRow[] = []
  const PAGE = 1000
  for (let off = 0; ; off += PAGE) {
    let q = supabaseAdmin
      .from('stock_movements')
      .select('brand, sku, date_start, out_qty')
      .order('date_start', { ascending: false })
      .range(off, off + PAGE - 1)
    if (cutoff) q = q.gte('date_start', cutoff)
    const { data, error } = await q
    if (error || !data || data.length === 0) break
    out.push(...data as MovementRow[])
    if (data.length < PAGE) break
  }
  return out
}

/**
 * Convenience: 200 days back from "now" — the standard window the app
 * uses for L3M / L6M / LM velocity basis. Calls fetchAllStockMovements.
 */
export async function fetchRecentStockMovements(): Promise<MovementRow[]> {
  const cutoff = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return fetchAllStockMovements(cutoff)
}
