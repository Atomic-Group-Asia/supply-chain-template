import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/agent/conversations/[id] → conversation + messages
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [{ data: conv, error: cErr }, { data: msgs, error: mErr }] = await Promise.all([
    supabaseAdmin.from('agent_conversations').select('*').eq('id', id).single(),
    supabaseAdmin.from('agent_messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true }),
  ])
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 404 })
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 400 })
  return NextResponse.json({ conversation: conv, messages: msgs || [] })
}

// PATCH /api/agent/conversations/[id]  body: { title?, pinned? }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const patch: any = {}
  if (body.title !== undefined) patch.title = body.title
  if (body.pinned !== undefined) patch.pinned = body.pinned
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'No fields' }, { status: 400 })
  const { data, error } = await supabaseAdmin
    .from('agent_conversations').update(patch).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

// DELETE
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabaseAdmin.from('agent_conversations').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
