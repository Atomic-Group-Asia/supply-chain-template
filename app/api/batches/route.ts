import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { reconcileSkuBatches } from '@/lib/batch-reconcile'

export const dynamic = 'force-dynamic'

const fields = [
  'sku', 'brand', 'batch_number', 'manufactured_date', 'expiry_date',
  'qty', 'qty_remaining', 'warehouse', 'notes', 'status',
]

export async function POST(req: Request) {
  try {
    const body = await req.json()
    // Required: sku + expiry_date + qty. batch_number is optional — we
    // auto-generate a placeholder (NO-BATCH-<expiry>-<rand>) when blank,
    // because the column is NOT NULL at the DB level.
    if (!body.sku || !body.expiry_date || body.qty == null) {
      return NextResponse.json({
        error: 'sku, expiry_date and qty are required',
      }, { status: 400 })
    }

    const cleaned: any = {}
    for (const k of fields) {
      const v = body[k]
      cleaned[k] = (v === '' || v === undefined || v === null) ? null : v
    }
    if (!cleaned.batch_number) {
      const compactDate = String(cleaned.expiry_date).replace(/-/g, '')
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
      cleaned.batch_number = `NO-BATCH-${compactDate}-${rand}`
    }
    if (cleaned.qty_remaining == null) cleaned.qty_remaining = cleaned.qty
    if (!cleaned.status) cleaned.status = 'active'

    const { data, error } = await supabaseAdmin
      .from('batches').insert(cleaned).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // FEFO reconcile: redistribute qty_remaining across this SKU's batches
    // so total active = Available (from gsheet). Older batches auto-deplete.
    let reconcile = null
    try {
      reconcile = await reconcileSkuBatches(data.brand, data.sku)
    } catch (e) {
      // Reconcile failure shouldn't block the insert
    }
    return NextResponse.json({ batch: data, reconcile })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
