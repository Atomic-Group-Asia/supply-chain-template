import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.product_sku || !body.packaging_code || body.qty_per_unit == null) {
      return NextResponse.json({ error: 'Product, packaging, and qty are required' }, { status: 400 })
    }

    // Auto-fill type from packaging
    let type = body.type ?? null
    if (!type) {
      const { data: pkg } = await supabaseAdmin
        .from('packaging').select('packaging_type').eq('packaging_code', body.packaging_code).single()
      type = pkg?.packaging_type ?? null
    }

    const fields = ['product_sku','packaging_code','qty_per_unit','source','notes']
    const cleaned: any = { type }
    for (const k of fields) {
      const v = body[k]
      cleaned[k] = (v === '' || v === undefined || v === null) ? null : v
    }
    cleaned.qty_per_unit = body.qty_per_unit

    const { data, error } = await supabaseAdmin.from('bom').insert(cleaned).select().single()
    if (error) {
      // Friendlier error for the most common cause: a BOM row already
      // exists for this (product, packaging) combo. Suggest editing the
      // existing row instead.
      if (/duplicate.*bom_product_sku_packaging_code/i.test(error.message)) {
        return NextResponse.json({
          error: `A BOM line for ${cleaned.product_sku} + ${cleaned.packaging_code} already exists. Open the BOM page, find that row, and edit it instead of adding a new one.`,
        }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ bom: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}