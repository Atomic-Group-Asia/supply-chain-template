import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// uom is editable via UI. stock_balance / incoming are GSheet-driven (read-only).
// pack_size kept in DB but not in UI — still drives Foil BOM cost calc.
const fields = ['packaging_name','packaging_type','brand','uom','supplier_code','source_channel','unit_cost','pack_size','moq','lead_time_days','notes']

export async function PATCH(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params
    const body = await req.json()
    const updates: any = {}
    for (const k of fields) {
      if (k in body) {
        const v = body[k]
        updates[k] = (v === '' || v === undefined || v === null) ? null : v
      }
    }
    const { data, error } = await supabaseAdmin
      .from('packaging').update(updates).eq('packaging_code', code).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ packaging: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params
    const { count: bomCount } = await supabaseAdmin
      .from('bom').select('*', { count: 'exact', head: true }).eq('packaging_code', code)
    if ((bomCount || 0) > 0) {
      return NextResponse.json({ error: `Cannot delete: ${bomCount} BOM lines reference this.` }, { status: 400 })
    }
    const { error } = await supabaseAdmin.from('packaging').delete().eq('packaging_code', code)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}