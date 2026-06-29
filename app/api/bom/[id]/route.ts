import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const fields = ['product_sku','packaging_code','qty_per_unit','source','notes']

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
    // Re-derive type if packaging changed
    if (updates.packaging_code) {
      const { data: pkg } = await supabaseAdmin
        .from('packaging').select('packaging_type').eq('packaging_code', updates.packaging_code).single()
      updates.type = pkg?.packaging_type ?? null
    }
    const { data, error } = await supabaseAdmin.from('bom').update(updates).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ bom: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { error } = await supabaseAdmin.from('bom').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}