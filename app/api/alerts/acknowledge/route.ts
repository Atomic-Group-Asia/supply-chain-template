import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  try {
    const { alert_key, actor } = await req.json()
    if (!alert_key) return NextResponse.json({ error: 'alert_key required' }, { status: 400 })

    const { data: existing } = await supabaseAdmin
      .from('alert_acknowledgements')
      .select('*')
      .eq('alert_key', alert_key)
      .maybeSingle()

    if (existing) {
      const { error } = await supabaseAdmin
        .from('alert_acknowledgements')
        .update({
          status: 'acknowledged',
          acknowledged_by: actor || 'Unknown',
          acknowledged_at: new Date().toISOString(),
        })
        .eq('alert_key', alert_key)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
      const { error } = await supabaseAdmin.from('alert_acknowledgements').insert({
        alert_key,
        status: 'acknowledged',
        acknowledged_by: actor || 'Unknown',
        acknowledged_at: new Date().toISOString(),
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
