import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.product_sku || !body.commitment_type || !body.qty || !body.reserved_for) {
      return NextResponse.json({ error: 'Product, type, qty, and reserved_for are required' }, { status: 400 })
    }

    const fields = ['product_sku','commitment_type','qty','reserved_for','wms_order_id','commitment_group_id','required_by_date','required_by_date_end','created_by','notes','status']
    const cleaned: any = {}
    for (const k of fields) {
      const v = body[k]
      cleaned[k] = (v === '' || v === undefined || v === null) ? null : v
    }
    if (!cleaned.status) cleaned.status = 'active'

    const { data, error } = await supabaseAdmin.from('stock_commitments').insert(cleaned).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ commitment: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}