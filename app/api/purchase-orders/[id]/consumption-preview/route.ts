import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { previewConsumption, type LineDelta } from '@/lib/packaging-consumption'

export const dynamic = 'force-dynamic'

/**
 * POST /api/purchase-orders/[id]/consumption-preview
 * body: { lines: [{ id, received_qty }] }
 *
 * Returns the packaging that would be consumed if the user confirmed
 * this receipt. Used by the receive modal to preview before submitting.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const incoming = body.lines || []
    if (!Array.isArray(incoming)) {
      return NextResponse.json({ error: 'lines[] required' }, { status: 400 })
    }

    const { data: po } = await supabaseAdmin
      .from('purchase_orders').select('po_type').eq('id', id).single()
    if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
    if (po.po_type !== 'FG') return NextResponse.json({ preview: [], reason: 'non-fg-po' })

    const { data: oldItems } = await supabaseAdmin
      .from('purchase_order_items').select('id, sku, received_qty').eq('po_id', id)
    const oldMap = new Map<string, { sku: string | null; received: number }>()
    for (const it of oldItems || []) {
      oldMap.set(it.id, { sku: it.sku, received: Number(it.received_qty) || 0 })
    }

    const deltas: LineDelta[] = incoming
      .filter((ln: any) => ln.id)
      .map((ln: any) => {
        const prev = oldMap.get(ln.id)
        return {
          line_id: ln.id,
          fg_sku: prev?.sku || null,
          old_received: prev?.received || 0,
          new_received: Math.max(0, Number(ln.received_qty) || 0),
        }
      })
    const preview = await previewConsumption(deltas)
    return NextResponse.json({ preview })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Preview failed' }, { status: 500 })
  }
}
