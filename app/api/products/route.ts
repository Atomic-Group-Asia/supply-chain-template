import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.sku || !body.product_name) {
      return NextResponse.json({ error: 'SKU and product name are required' }, { status: 400 })
    }

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
    const cleaned: any = {}
    for (const k of fields) {
      const v = body[k]
      cleaned[k] = (v === '' || v === undefined || v === null) ? null : v
    }

    const { data, error } = await supabaseAdmin
      .from('products').insert(cleaned).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ product: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}