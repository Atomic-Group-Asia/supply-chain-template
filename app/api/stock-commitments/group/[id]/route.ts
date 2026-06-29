import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// PATCH /api/stock-commitments/group/[id]  body: { status? | ...metadata }
// Updates EVERY row that shares the commitment_group_id (so changing the
// status, reserved_for, wms_order_id, etc. propagates to all SKU rows in
// the commitment in one shot).
const fields = [
  'commitment_type', 'reserved_for', 'wms_order_id',
  'required_by_date', 'required_by_date_end', 'created_by', 'notes', 'status',
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
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }
    const { data, error } = await supabaseAdmin
      .from('stock_commitments')
      .update(updates)
      .eq('commitment_group_id', id)
      .select()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ updated: data?.length || 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/stock-commitments/group/[id]
// Deletes every row sharing the commitment_group_id.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { error, count } = await supabaseAdmin
      .from('stock_commitments')
      .delete({ count: 'exact' })
      .eq('commitment_group_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ deleted: count || 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
