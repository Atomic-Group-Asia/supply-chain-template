import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST /api/agent/conversations/[id]/messages  body: { role, content, tool_calls? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { role, content, tool_calls } = body
  if (!role || content == null) return NextResponse.json({ error: 'role + content required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('agent_messages')
    .insert({ conversation_id: id, role, content, tool_calls: tool_calls || null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Bump last_message_at and (if first user message and title is default) set title
  const patch: any = { last_message_at: new Date().toISOString() }
  if (role === 'user' && content) {
    const { data: conv } = await supabaseAdmin.from('agent_conversations').select('title').eq('id', id).single()
    if (conv && (conv.title === 'New chat' || conv.title === 'Untitled')) {
      patch.title = (content as string).slice(0, 60).replace(/\n+/g, ' ')
    }
  }
  await supabaseAdmin.from('agent_conversations').update(patch).eq('id', id)

  return NextResponse.json(data)
}
