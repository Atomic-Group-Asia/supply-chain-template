import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body.packaging_code || !body.packaging_name) {
      return NextResponse.json({ error: 'Code and name are required' }, { status: 400 })
    }
    const fields = ['packaging_code','packaging_name','packaging_type','supplier_code','source_channel','unit_cost','moq','lead_time_days','notes']
    const cleaned: any = {}
    for (const k of fields) {
      const v = body[k]
      cleaned[k] = (v === '' || v === undefined || v === null) ? null : v
    }
    const { data, error } = await supabaseAdmin.from('packaging').insert(cleaned).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ packaging: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}