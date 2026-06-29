import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const fields = [
  'sku', 'product_name', 'brand', 'oem_supplier_code', 'billing_supplier_code',
  'spec', 'size', 'unit_cost', 'selling_price',
  'safety_stock_qty', 'moq', 'lead_time_days',
  'qty_per_carton', 'cartons_per_pallet',
  'unit_weight_g', 'unit_dims', 'carton_weight_kg',
  'barcode', 'inner_barcode', 'hs_code', 'country_of_origin',
  'shelf_life_months', 'min_acceptable_shelf_life_days',
  'storage_conditions', 'product_status', 'launch_date',
  'primary_image_url', 'kkm_reg_no',
]

export async function PATCH(req: Request, { params }: { params: Promise<{ sku: string }> }) {
  try {
    const { sku } = await params
    const body = await req.json()
    const updates: any = {}
    for (const k of fields) {
      if (k in body) {
        const v = body[k]
        updates[k] = (v === '' || v === undefined || v === null) ? null : v
      }
    }
    updates.updated_at = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('products')
      .update(updates)
      .eq('sku', decodeURIComponent(sku))
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ product: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Update failed' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ sku: string }> }) {
  try {
    const { sku } = await params
    const { error } = await supabaseAdmin
      .from('products')
      .delete()
      .eq('sku', decodeURIComponent(sku))
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 })
  }
}
