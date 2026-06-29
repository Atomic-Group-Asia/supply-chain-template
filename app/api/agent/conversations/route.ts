import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/agent/conversations?user=Syuen → list this user's conversations
export async function GET(req: Request) {
  const url = new URL(req.url)
  const user = url.searchParams.get('user')
  if (!user) return NextResponse.json({ error: 'user required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('agent_conversations')
    .select('*')
    .eq('user_name', user)
    .order('pinned', { ascending: false })
    .order('last_message_at', { ascending: false })
    .limit(40)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data || [])
}

// POST /api/agent/conversations  body: { user_name, title }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { user_name, title } = body
  if (!user_name) return NextResponse.json({ error: 'user_name required' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('agent_conversations')
    .insert({ user_name, title: title || 'New chat' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
