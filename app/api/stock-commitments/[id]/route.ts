import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const fields = ['product_sku','commitment_type','qty','reserved_for','wms_order_id','commitment_group_id','required_by_date','required_by_date_end','created_by','notes','status']

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
    const { data, error } = await supabaseAdmin.from('stock_commitments').update(updates).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ commitment: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { error } = await supabaseAdmin.from('stock_commitments').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}