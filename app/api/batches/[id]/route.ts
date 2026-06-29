import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { reconcileSkuBatches } from '@/lib/batch-reconcile'

export const dynamic = 'force-dynamic'

const fields = [
  'sku', 'brand', 'batch_number', 'manufactured_date', 'expiry_date',
  'qty', 'qty_remaining', 'warehouse', 'notes', 'status',
]

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const updates: any = {}
    for (const k of fields) {
      if (k in body) {
        const v = body[k]
        updates[k] = (v === '' || v === undefined || v === null) ? null : v
      }
    }
    const { data, error } = await supabaseAdmin
      .from('batches').update(updates).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    let reconcile = null
    try { reconcile = await reconcileSkuBatches(data.brand, data.sku) } catch {}
    return NextResponse.json({ batch: data, reconcile })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    // Grab brand+sku BEFORE delete so we can reconcile after
    const { data: existing } = await supabaseAdmin
      .from('batches').select('brand, sku').eq('id', id).single()
    const { error } = await supabaseAdmin.from('batches').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    let reconcile = null
    if (existing) {
      try { reconcile = await reconcileSkuBatches(existing.brand, existing.sku) } catch {}
    }
    return NextResponse.json({ ok: true, reconcile })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
