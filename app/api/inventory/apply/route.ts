import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { invalidateStockCache } from '@/lib/fg-inventory'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/inventory/apply
 * body: { brand: string, diffs: [{ sku, new_qty }], uploaded_by? }
 *
 * Upsert each (brand, sku) row in daily_stock_current with new_qty.
 * Batches are NOT touched — they're a separate ledger now.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { brand, diffs } = body as { brand: string; diffs: any[] }
    if (!brand || !Array.isArray(diffs)) {
      return NextResponse.json({ error: 'brand and diffs are required' }, { status: 400 })
    }

    let outflowsApplied = 0
    let inflowsApplied = 0
    const errors: string[] = []
    const now = new Date().toISOString()

    // Upsert in batches of 100
    const rows = diffs
      .filter(d => d.change !== 'no_change' && d.sku)
      .map(d => ({ brand, sku: d.sku, qty: Number(d.new_qty) || 0, updated_at: now }))

    for (const d of diffs) {
      if (d.change === 'outflow') outflowsApplied++
      else if (d.change === 'inflow') inflowsApplied++
    }

    if (rows.length > 0) {
      const { error } = await supabaseAdmin
        .from('daily_stock_current')
        .upsert(rows, { onConflict: 'brand,sku' })
      if (error) errors.push(error.message)
    }

    // FEFO deduct from batches for every outflow. Inflows are NOT
    // auto-handled (user manually adds new batches in /batches).
    //
    // We keep status='active' even after qty_remaining hits zero so the
    // user still sees the batch in their list as a historical record
    // (showing 0). Future FEFO planning naturally skips zero-qty batches
    // via the `if (avail <= 0) continue` guard in the preview route.
    for (const d of diffs) {
      if (d.change !== 'outflow' || !d.fefo_plan) continue
      for (const step of d.fefo_plan) {
        const newRemaining = Number(step.new_remaining)
        const { error } = await supabaseAdmin
          .from('batches')
          .update({ qty_remaining: newRemaining })
          .eq('id', step.batch_id)
        if (error) errors.push(`FEFO ${step.batch_number}: ${error.message}`)
      }
    }

    if (errors.length === 0) invalidateStockCache()

    // Audit log
    if (rows.length > 0) {
      try {
        await supabaseAdmin.from('stock_upload_log').insert({
          brand,
          uploaded_by: body.uploaded_by || null,
          outflows_applied: outflowsApplied,
          inflows_applied: inflowsApplied,
          total_skus: diffs.length,
          notes: errors.length ? `errors: ${errors.slice(0, 3).join('; ')}` : null,
        })
      } catch {}
    }

    return NextResponse.json({
      ok: errors.length === 0,
      outflows_applied: outflowsApplied,
      inflows_applied: inflowsApplied,
      errors,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Apply failed' }, { status: 500 })
  }
}
