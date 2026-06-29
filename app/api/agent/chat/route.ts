import OpenAI from 'openai'
import { TOOLS, executeTool } from '@/lib/agent-tools'
import { buildSystemPrompt } from '@/lib/agent-prompts'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Role = 'coo' | 'ops'

type IncomingMessage = {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(req: Request) {
  if (!process.env.DEEPSEEK_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'DEEPSEEK_API_KEY not configured. Add it to Vercel env vars.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { messages, userName, role } = body as { messages: IncomingMessage[]; userName: string; role: Role }
  if (!messages || !userName || !role) {
    return new Response(JSON.stringify({ error: 'Missing messages, userName, or role' }), { status: 400 })
  }

  // DeepSeek OpenAI-compatible endpoint
  const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com/v1',
  })

  const systemPrompt = buildSystemPrompt(userName, role)

  // Convert Anthropic tool format → OpenAI tool format
  const oaiTools = TOOLS.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }))

  // Build conversation
  const apiMessages: any[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role, content: m.content })),
  ]

  // SSE stream to client
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: any) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        let safety = 0
        while (safety++ < 8) {
          const response = await client.chat.completions.create({
            model: 'deepseek-chat',
            messages: apiMessages,
            tools: oaiTools,
            temperature: 0.3,
            max_tokens: 4096,
          })

          const msg = response.choices[0].message
          // Stream text content
          if (msg.content) {
            send('text', { text: msg.content })
          }

          // If model wants to call tools
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            // Append assistant message (with tool_calls)
            apiMessages.push({
              role: 'assistant',
              content: msg.content || '',
              tool_calls: msg.tool_calls,
            })
            // Execute each tool, send back results
            for (const tc of msg.tool_calls as any[]) {
              const fn = tc.function
              if (!fn) continue
              let input: any
              try { input = JSON.parse(fn.arguments || '{}') } catch { input = {} }
              send('tool_call', { id: tc.id, name: fn.name, input })
              const result = await executeTool(fn.name, input)
              send('tool_result', { id: tc.id, name: fn.name, result })
              apiMessages.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(result),
              })
            }
            continue // ask model again with tool results
          }

          // No tool calls — end of turn
          break
        }
        send('done', { ok: true })
      } catch (e: any) {
        const msg = e?.error?.message || e?.message || String(e)
        send('error', { error: msg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
