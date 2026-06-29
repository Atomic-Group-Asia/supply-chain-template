'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { useCurrentUser } from './CurrentUserContext'
import { dailyBriefSeed, suggestedPrompts } from '@/lib/agent-prompts'
import { fmtTime } from '@/lib/format'

type ToolCall = { id?: string; name: string; input: any }
type ToolResult = { id?: string; name: string; result: any }

type Msg = {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCall[]
  toolResults?: ToolResult[]
}

type Conversation = {
  id: string
  user_name: string
  title: string
  pinned: boolean
  created_at: string
  last_message_at: string
}

export function AgentChat() {
  const { current } = useCurrentUser()
  const [convs, setConvs] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [briefedFor, setBriefedFor] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }, [])

  // Load conversations list
  const loadConvs = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/conversations?user=${encodeURIComponent(current.name)}`)
      if (!res.ok) return
      const data = await res.json()
      setConvs(data || [])
    } catch {}
  }, [current.name])

  useEffect(() => { loadConvs() }, [loadConvs])

  // Per-user sessionStorage key for the last active conversation id.
  // Different viewer roles get isolated keys so switching never crosses chats.
  const sessionKey = `atomic-ops-active-conv:${current.name}`

  // Reset chat ONLY when the viewer (user) actually switches.
  // On plain navigation (back to /agent) we keep the previous chat via the
  // sessionStorage restore below.
  useEffect(() => {
    if (briefedFor === null) {
      setBriefedFor(current.name)
      return
    }
    if (briefedFor === current.name) return
    // Hard isolation between viewers: blow away every trace of the previous
    // viewer's chat (messages, active conv, sidebar list) so nothing leaks.
    setMessages([])
    setActiveConvId(null)
    setConvs([])
    setBriefedFor(current.name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.name])

  // Track restore attempts per sessionKey (per viewer name).
  //  - sessionStorageTriedRef: we've checked sessionStorage for this user
  //  - convsFallbackTriedRef: we've fallen back to convs[0] for this user
  // Refs not state — they don't trigger re-renders.
  const sessionStorageTriedRef = useRef<string | null>(null)
  const convsFallbackTriedRef = useRef<string | null>(null)

  // Restore the saved conversation when sessionKey or convs changes.
  // (1) sessionStorage path runs once per viewer, synchronously on mount.
  // (2) convs fallback runs once per viewer, ONLY after convs has loaded
  //     AND belongs to the current viewer — defensive against stale data
  //     during a viewer switch.
  useEffect(() => {
    if (activeConvId) return
    if (messages.length > 0) return

    // Step 1: sessionStorage (instant, doesn't need convs)
    if (sessionStorageTriedRef.current !== sessionKey) {
      sessionStorageTriedRef.current = sessionKey
      try {
        const savedId = sessionStorage.getItem(sessionKey)
        if (savedId) {
          loadConv(savedId)
          return
        }
      } catch {}
    }

    // Step 2: fall back to most recent conv in this viewer's list
    if (convsFallbackTriedRef.current === sessionKey) return
    if (convs.length === 0) return
    if (convs[0].user_name && convs[0].user_name !== current.name) return // stale, wait
    convsFallbackTriedRef.current = sessionKey
    loadConv(convs[0].id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey, convs, activeConvId, messages.length, current.name])

  // Persist the active conversation id — ONLY writes, never removes.
  // Explicit clearing happens in newConversation().
  useEffect(() => {
    if (!activeConvId) return
    try { sessionStorage.setItem(sessionKey, activeConvId) } catch {}
  }, [activeConvId, sessionKey])

  // Detect "morning brief" intent in user messages and inject the structured brief prompt.
  function isMorningBriefRequest(text: string): boolean {
    const t = text.toLowerCase().trim()
    return (
      /\bmorning brief\b/.test(t) ||
      /\bdaily brief\b/.test(t) ||
      /\btoday'?s? brief\b/.test(t) ||
      /\bgive me .*brief\b/.test(t) ||
      /\bgood morning\b.*\bbrief\b/.test(t) ||
      /早安.*(brief|简报|汇报)/.test(t) ||
      /(brief|简报).*早安/.test(t)
    )
  }

  async function createConversation(firstUserContent: string | null): Promise<string | null> {
    try {
      const res = await fetch('/api/agent/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_name: current.name, title: firstUserContent ? firstUserContent.slice(0, 60) : 'Morning brief' }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        if (err.error && /relation .* does not exist|agent_conversations/i.test(err.error)) {
          setError(`Agent DB tables not set up. Run migrations/2026-05-16-agent-tables.sql on Supabase.`)
        }
        return null
      }
      const c = await res.json()
      setActiveConvId(c.id)
      loadConvs()
      return c.id
    } catch { return null }
  }

  async function saveMessage(convId: string, msg: { role: string; content: string; tool_calls?: any }) {
    try {
      await fetch(`/api/agent/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg),
      })
    } catch {}
  }

  async function runChat(content: string, opts?: { hideUserMsg?: boolean; isBrief?: boolean }) {
    if (!content.trim() || busy) return
    setError(null)
    const userMsg: Msg = { role: 'user', content }
    if (!opts?.hideUserMsg) {
      setMessages(prev => [...prev, userMsg])
    }
    setInput('')
    setBusy(true)
    scrollToBottom()

    // If user asks for a morning brief, swap in the structured seed prompt
    // so the agent renders the full card layout (not just a plain Q&A reply).
    // NOTE: we don't gate conversation-create on isBrief — even brief requests
    // are real user-initiated messages and must be persisted to DB.
    let effectiveContent = content
    if (isMorningBriefRequest(content)) {
      effectiveContent = dailyBriefSeed(current.role, current.name)
    }

    // Ensure we have an active conversation. Create one lazily on the very
    // first user message of a new chat (including morning briefs).
    let convId = activeConvId
    if (!convId) {
      convId = await createConversation(opts?.hideUserMsg ? null : content)
    }
    if (convId && !opts?.hideUserMsg) {
      saveMessage(convId, { role: 'user', content })
    }

    // Placeholder assistant message
    setMessages(prev => [...prev, { role: 'assistant', content: '', toolCalls: [], toolResults: [] }])

    let finalContent = ''
    let finalToolCalls: ToolCall[] = []
    let finalToolResults: ToolResult[] = []

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: opts?.hideUserMsg
            ? [{ role: 'user', content: effectiveContent }]
            : [...messages, { role: 'user' as const, content: effectiveContent }].map(m => ({ role: m.role, content: m.content })),
          userName: current.name,
          role: current.role,
        }),
      })
      if (!res.ok || !res.body) {
        const t = await res.text()
        throw new Error(t || `HTTP ${res.status}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const ev of events) {
          if (!ev.trim()) continue
          const lines = ev.split('\n')
          let eventName = 'message'
          let dataStr = ''
          for (const line of lines) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim()
            else if (line.startsWith('data:')) dataStr += line.slice(5).trim()
          }
          if (!dataStr) continue
          let payload: any
          try { payload = JSON.parse(dataStr) } catch { continue }

          if (eventName === 'text') {
            finalContent += payload.text
            setMessages(prev => {
              const copy = [...prev]
              const last = copy[copy.length - 1]
              if (last && last.role === 'assistant') copy[copy.length - 1] = { ...last, content: last.content + payload.text }
              return copy
            })
            scrollToBottom()
          } else if (eventName === 'tool_call') {
            const tc = { id: payload.id, name: payload.name, input: payload.input }
            finalToolCalls.push(tc)
            setMessages(prev => {
              const copy = [...prev]
              const last = copy[copy.length - 1]
              if (last && last.role === 'assistant') copy[copy.length - 1] = { ...last, toolCalls: [...(last.toolCalls || []), tc] }
              return copy
            })
            scrollToBottom()
          } else if (eventName === 'tool_result') {
            const tr = { id: payload.id, name: payload.name, result: payload.result }
            finalToolResults.push(tr)
            setMessages(prev => {
              const copy = [...prev]
              const last = copy[copy.length - 1]
              if (last && last.role === 'assistant') copy[copy.length - 1] = { ...last, toolResults: [...(last.toolResults || []), tr] }
              return copy
            })
          } else if (eventName === 'error') {
            setError(payload.error || 'Unknown error')
          } else if (eventName === 'done') {
            // stream complete
          }
        }
      }

      // Save final assistant message
      if (convId && finalContent) {
        saveMessage(convId, {
          role: 'assistant',
          content: finalContent,
          tool_calls: { calls: finalToolCalls, results: finalToolResults },
        })
      }
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
      scrollToBottom()
    }
  }

  async function loadConv(id: string) {
    try {
      const res = await fetch(`/api/agent/conversations/${id}`)
      if (!res.ok) return
      const { conversation, messages: msgs } = await res.json()
      // ✨ Belt-and-braces isolation: refuse to load if the conversation
      // does not belong to the current viewer. Wipes any stale sessionStorage
      // key so this can't happen again next mount.
      if (conversation && conversation.user_name && conversation.user_name !== current.name) {
        try { sessionStorage.removeItem(sessionKey) } catch {}
        return
      }
      const loaded: Msg[] = (msgs || []).map((m: any) => ({
        role: m.role,
        content: m.content,
        toolCalls: m.tool_calls?.calls || [],
        toolResults: m.tool_calls?.results || [],
      }))
      setMessages(loaded)
      setActiveConvId(id)
    } catch {}
  }

  function newConversation() {
    setMessages([])
    setActiveConvId(null)
    setBriefedFor(current.name) // don't retrigger brief auto-fire
    // Block both restore paths for this user so the empty state actually
    // sticks until they type the first message of the new chat.
    sessionStorageTriedRef.current = sessionKey
    convsFallbackTriedRef.current = sessionKey
    try { sessionStorage.removeItem(sessionKey) } catch {}
  }

  async function togglePin(id: string, currentPinned: boolean) {
    await fetch(`/api/agent/conversations/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !currentPinned }),
    })
    loadConvs()
  }

  async function renameConv(id: string, currentTitle: string) {
    const next = window.prompt('Rename conversation', currentTitle)?.trim()
    if (!next || next === currentTitle) return
    await fetch(`/api/agent/conversations/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: next.slice(0, 120) }),
    })
    loadConvs()
  }

  async function deleteConv(id: string) {
    if (!confirm('Delete this conversation?')) return
    await fetch(`/api/agent/conversations/${id}`, { method: 'DELETE' })
    if (activeConvId === id) newConversation()
    loadConvs()
  }

  const prompts = suggestedPrompts(current.role, current.name)
  const pinned = convs.filter(c => c.pinned)
  const recent = convs.filter(c => !c.pinned).slice(0, 15)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 lg:gap-5">
      {/* Main chat */}
      <div className="bg-white border border-[#D4D0C7] rounded-lg overflow-hidden">
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-[14px] sm:text-[15px] flex items-center gap-2 flex-wrap">
              Agent <span className="inline-block px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider bg-[#E8EFE5] text-[#4A6B3D] rounded">Connected</span>
            </div>
            <div className="text-[11px] font-mono text-[#6B6B6B] mt-0.5 truncate">
              Viewing as <strong>{current.name}</strong> · {current.title}
            </div>
          </div>
          <button onClick={newConversation} className="shrink-0 px-2.5 sm:px-3 py-1.5 border border-[#D4D0C7] rounded text-[12px] hover:bg-white font-medium whitespace-nowrap">
            + New
          </button>
        </div>

        <div className="px-4 sm:px-6 py-4 sm:py-5 h-[calc(100vh-280px)] min-h-[420px] overflow-y-auto flex flex-col gap-4 sm:gap-5">
          {messages.length === 0 && !busy && (
            <div className="text-center py-12">
              <div className="text-[15px] text-[#1A1A1A] font-medium mb-1">
                Good morning, {current.name}.
              </div>
              <div className="text-[13px] text-[#6B6B6B] mb-5">
                Ready when you are. Ask me anything, or get your daily brief.
              </div>
              <button
                onClick={() => runChat('Good morning, give me my morning brief')}
                disabled={busy}
                className="px-4 py-2 bg-[#1A1A1A] text-white rounded text-[13px] hover:bg-black disabled:opacity-40"
              >
                ☀ Generate morning brief
              </button>
              <div className="text-[11px] text-[#6B6B6B] mt-3">
                Or type your question below — agent stays quiet until you ask.
              </div>
            </div>
          )}
          {messages.map((m, idx) => (
            <MessageView key={idx} msg={m} viewerRole={current.role} />
          ))}
          {error && (
            <div className="bg-[#F5DEDA] border border-[#A53025] text-[#A53025] text-[12px] p-3 rounded">
              <strong>Error:</strong> {error}
              {error.includes('DEEPSEEK_API_KEY') && (
                <div className="mt-1.5 text-[11px]">
                  Add <code className="bg-white px-1 rounded">DEEPSEEK_API_KEY</code> at <a href="https://platform.deepseek.com/api_keys" target="_blank" className="underline">platform.deepseek.com/api_keys</a>.
                </div>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="px-6 py-4 border-t border-[#D4D0C7] bg-white">
          <form onSubmit={e => { e.preventDefault(); runChat(input) }} className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runChat(input) }
              }}
              rows={1}
              disabled={busy}
              placeholder="Ask anything... e.g. 'stock for TPD', 'who's my top supplier?', 'draft PO for DH'"
              className="flex-1 px-3 py-2 border border-[#D4D0C7] rounded text-[11px] resize-none focus:outline-none focus:border-[#C8432C] leading-snug"
              style={{ minHeight: '38px', maxHeight: '120px' }}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="px-4 py-2 bg-[#1A1A1A] text-white rounded text-[13px] hover:bg-black disabled:opacity-40"
            >
              {busy ? '…' : 'Send'}
            </button>
          </form>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {prompts.map((p, i) => (
              <button
                key={i}
                onClick={() => runChat(p)}
                disabled={busy}
                className="px-2.5 py-1 border border-[#D4D0C7] rounded-full text-[11px] hover:bg-[#FAFAF7] disabled:opacity-40"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Sidebar: Pinned + Recent — stacks under chat on mobile, side panel on lg+.
          On mobile each section starts collapsed to keep the chat above the fold;
          tap header to expand. Desktop stays expanded. */}
      <div className="flex flex-col gap-4">
        {pinned.length > 0 && (
          <ConvSection title={`📌 Pinned Conversations (${pinned.length})`} startOpen>
            <div className="max-h-[200px] overflow-y-auto">
              {pinned.map(c => <ConvRow key={c.id} c={c} active={c.id === activeConvId} onClick={() => loadConv(c.id)} onPin={togglePin} onRename={renameConv} onDelete={deleteConv} />)}
            </div>
          </ConvSection>
        )}
        <ConvSection title={`Recent Conversations (${recent.length})`} startOpen>
          <div className="max-h-[60vh] lg:max-h-[calc(100vh-340px)] overflow-y-auto">
            {recent.length === 0 && (
              <div className="px-4 py-6 text-center text-[11px] text-[#6B6B6B]">No conversations yet.</div>
            )}
            {recent.map(c => <ConvRow key={c.id} c={c} active={c.id === activeConvId} onClick={() => loadConv(c.id)} onPin={togglePin} onRename={renameConv} onDelete={deleteConv} />)}
          </div>
        </ConvSection>
      </div>
    </div>
  )
}

function ConvSection({ title, startOpen, children }: { title: string; startOpen: boolean; children: React.ReactNode }) {
  // Mobile detection — open by default on lg+, closed on mobile so chat
  // stays above the fold. User can tap to expand.
  const [isMobile, setIsMobile] = useState(false)
  const [open, setOpen] = useState(startOpen)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    setIsMobile(mq.matches)
    if (mq.matches) setOpen(false)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  // On desktop force-open (the toggle is hidden but kept for state correctness)
  const effectiveOpen = isMobile ? open : true
  return (
    <div className="bg-white border border-[#D4D0C7] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => isMobile && setOpen(o => !o)}
        className="w-full px-4 py-2.5 bg-[#FAFAF7] border-b border-[#D4D0C7] font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] flex items-center justify-between text-left lg:cursor-default"
      >
        <span>{title}</span>
        <span className="lg:hidden text-[#6B6B6B]">{effectiveOpen ? '▾' : '▸'}</span>
      </button>
      {effectiveOpen && children}
    </div>
  )
}

function ConvRow({ c, active, onClick, onPin, onRename, onDelete }: { c: Conversation; active: boolean; onClick: () => void; onPin: (id: string, p: boolean) => void; onRename: (id: string, title: string) => void; onDelete: (id: string) => void }) {
  const when = new Date(c.last_message_at)
  const today = new Date()
  const sameDay = when.toDateString() === today.toDateString()
  // Always show date + time. Same day shows "Today 13:53"; other days show
  // "22 May 13:53" so the user can tell which conversation belongs to when.
  const datePart = sameDay
    ? 'Today'
    : when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' })
  const label = `${datePart} · ${fmtTime(when)}`
  return (
    <div
      onClick={onClick}
      className={`group px-4 py-2 cursor-pointer border-b border-[#F0EDE4] last:border-0 hover:bg-[#FAFAF7] ${active ? 'bg-[#FFF5F1]' : ''}`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="text-[13px] font-medium leading-tight truncate" title={c.title}>{c.title}</div>
        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={e => { e.stopPropagation(); onPin(c.id, c.pinned) }} className="text-[12px] text-[#6B6B6B] hover:text-[#C8432C]" title={c.pinned ? 'Unpin' : 'Pin'}>{c.pinned ? '★' : '☆'}</button>
          <button onClick={e => { e.stopPropagation(); onRename(c.id, c.title) }} className="text-[11px] text-[#6B6B6B] hover:text-[#C8432C]" title="Rename">✎</button>
          <button onClick={e => { e.stopPropagation(); onDelete(c.id) }} className="text-[13px] leading-none text-[#6B6B6B] hover:text-[#C8432C]" title="Delete">×</button>
        </div>
      </div>
      <div className="text-[10px] font-mono text-[#6B6B6B] mt-0.5">{label}</div>
    </div>
  )
}

function MessageView({ msg, viewerRole }: { msg: Msg; viewerRole?: 'coo' | 'ops' }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-[#1A1A1A] text-white rounded-2xl px-4 py-2.5 max-w-[80%] text-[13px]">{msg.content}</div>
      </div>
    )
  }
  // Detect special cards from tool results
  const whatsappDrafts = (msg.toolResults || []).filter(tr => tr.name === 'draft_whatsapp_message' && tr.result?.success)
  // Find a query_purchase_decisions result that has draft items → render Recommended POs card
  const decisionResults = (msg.toolResults || []).filter(tr => tr.name === 'query_purchase_decisions' && tr.result?.success)
  const draftItems = decisionResults.flatMap(tr => (tr.result.data?.items || []).filter((it: any) => it.status === 'draft'))
  // Pending POs (Syuen approval queue) — render structured card
  const pendingPosResults = (msg.toolResults || []).filter(tr =>
    tr.name === 'query_pos' && tr.result?.success && (tr.result.data?.items || []).some((p: any) => p.status === 'pending')
  )
  const pendingPos = pendingPosResults.flatMap(tr => (tr.result.data?.items || []).filter((p: any) => p.status === 'pending'))
  // Overdue POs
  const overduePosResults = (msg.toolResults || []).filter(tr =>
    tr.name === 'query_pos' && tr.result?.success
  )
  const overduePos = overduePosResults.flatMap(tr => {
    const items = tr.result.data?.items || []
    const today = new Date().toISOString().slice(0, 10)
    return items.filter((p: any) => p.status === 'approved' && p.expected_date && p.expected_date < today)
  })
  return (
    <div className="flex flex-col gap-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">
        Agent · {fmtTime(new Date())}
      </div>
      <div className="bg-[#FAFAF7] border border-[#D4D0C7] rounded-lg px-4 py-3 text-[13px] leading-relaxed">
        {msg.content
          ? <div className="prose prose-sm max-w-none [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_code]:bg-white [&_code]:px-1 [&_code]:rounded [&_strong]:font-semibold [&_h1]:text-[16px] [&_h2]:text-[15px] [&_h3]:text-[14px]">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          : <span className="text-[#6B6B6B] italic">Thinking…</span>}
      </div>
      {pendingPos.length > 0 && <PendingPOsCard items={pendingPos} />}
      {overduePos.length > 0 && <OverduePOsCard items={overduePos} />}
      {draftItems.length > 0 && viewerRole !== 'coo' && <RecommendedPOsCard items={draftItems} />}
      {whatsappDrafts.length > 0 && whatsappDrafts.map((d, i) => (
        <WhatsAppDraftCard key={i} data={d.result.data} />
      ))}
      {/* tool chips hidden by default — uncomment if you want them visible for debugging */}
      {/* {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {msg.toolCalls.map((tc, i) => (
            <span key={i} className="font-mono text-[10px] bg-[#EDEAE2] text-[#6B6B6B] px-1.5 py-0.5 rounded" title={JSON.stringify(tc.input)}>🔧 {tc.name}</span>
          ))}
        </div>
      )} */}
    </div>
  )
}

function RecommendedPOsCard({ items }: { items: any[] }) {
  // Only show items that DON'T have an active PO yet (avoid duplicate drafting)
  const actionable = items.filter((it: any) => !it.active_po)
  if (actionable.length === 0) return null
  const top = actionable.slice(0, 8)
  const totalAmt = actionable.reduce((s: number, it: any) => s + (Number(it.amount) || 0), 0)
  const reasonBits: string[] = []
  for (const it of actionable.slice(0, 4)) {
    if (it.stock_months < 1) reasonBits.push(`${it.product_name} critical at ${Number(it.stock_months).toFixed(2)} months`)
    else if (it.stock_months < 2.5) reasonBits.push(`${it.product_name} low at ${Number(it.stock_months).toFixed(2)} months`)
  }
  const reasoning = reasonBits.length > 0
    ? reasonBits.join('. ') + '.'
    : 'Multiple SKUs approaching reorder threshold based on L3M velocity.'

  return (
    <div className="border border-[#C8432C] rounded-lg overflow-hidden bg-white">
      <div className="px-4 py-3 border-b border-[#C8432C]/20 flex items-center justify-between">
        <div className="text-[14px] font-medium">
          Recommended POs · {actionable.length} item{actionable.length > 1 ? 's' : ''} · <span className="sensitive">RM {totalAmt.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wider bg-[#FFF5F1] text-[#C8432C] border border-[#C8432C]/30 px-2 py-0.5 rounded">Needs Approval</span>
      </div>
      <div>
        {top.map((it: any, i: number) => (
          <div key={i} className="px-4 py-2.5 border-b border-[#F0EDE4] last:border-0 flex items-center justify-between text-[12px]">
            <div className="font-mono text-[12px] text-[#C8432C] w-[180px] truncate">{it.product_name || it.sku}</div>
            <div className="font-mono text-[12px] text-[#3D3D3D] flex-1 px-4">
              {Number(it.suggest_qty || 0).toLocaleString()} units · <span className="sensitive">{it.supplier_name || 'pick supplier'}</span> · {it.payment_terms || '—'}
            </div>
            <div className="font-mono text-[12px] text-right w-[100px]"><span className="sensitive">RM {Number(it.amount || 0).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></div>
          </div>
        ))}
        {actionable.length > top.length && (
          <div className="px-4 py-2 text-[11px] text-[#6B6B6B] text-center border-b border-[#F0EDE4]">
            + {actionable.length - top.length} more SKU{actionable.length - top.length > 1 ? 's' : ''}
          </div>
        )}
      </div>
      <div className="px-4 py-3 text-[11px] text-[#6B6B6B] border-t border-[#F0EDE4] bg-[#FAFAF7]">
        <strong className="text-[#3D3D3D]">Reasoning:</strong> {reasoning}
      </div>
      <div className="px-4 py-3 border-t border-[#F0EDE4] flex gap-2 bg-white">
        <a
          href="/purchase-decisions"
          className="px-3 py-1.5 bg-[#1A1A1A] text-white rounded text-[12px] hover:bg-black font-medium"
        >
          Draft all POs
        </a>
        <a
          href="/purchase-decisions"
          className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[12px] hover:bg-[#FAFAF7]"
        >
          Review each
        </a>
        <button
          type="button"
          className="px-3 py-1.5 text-[12px] text-[#6B6B6B] hover:text-[#1A1A1A]"
          onClick={(e) => { (e.currentTarget.closest('.border-\\[\\#C8432C\\]') as HTMLElement)?.style.setProperty('display', 'none') }}
        >
          Skip
        </button>
      </div>
    </div>
  )
}

function PendingPOsCard({ items }: { items: any[] }) {
  const totalAmt = items.reduce((s: number, p: any) => s + (Number(p.total_amount) || 0), 0)
  return (
    <div className="border border-[#C8432C] rounded-lg overflow-hidden bg-white">
      <div className="px-4 py-3 border-b border-[#C8432C]/20 flex items-center justify-between">
        <div className="text-[14px] font-medium">
          Pending Approvals · {items.length} PO{items.length > 1 ? 's' : ''} · <span className="sensitive">RM {totalAmt.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wider bg-[#FFF5F1] text-[#C8432C] border border-[#C8432C]/30 px-2 py-0.5 rounded">Needs Approval</span>
      </div>
      <div>
        {items.map((p: any, i: number) => {
          const items = p.items || []
          const itemSummary = items.slice(0, 3).map((it: any) => `${it.sku} (${Number(it.qty || 0).toLocaleString()})`).join(', ')
          const more = items.length > 3 ? ` +${items.length - 3}` : ''
          const brand = Array.isArray(p.brands) ? p.brands.join('/') : (p.brands || p.entity_code)
          return (
            <div key={i} className="px-4 py-3 border-b border-[#F0EDE4] last:border-0 grid grid-cols-[180px_1fr_auto] gap-4 items-center text-[12px]">
              <div>
                <div className="font-mono text-[12px] text-[#C8432C] font-medium">{p.po_number}</div>
                <div className="text-[10px] text-[#6B6B6B] mt-0.5">{brand} · {p.po_type}</div>
              </div>
              <div className="font-mono text-[11px] text-[#3D3D3D] leading-relaxed">
                <span className="sensitive">{p.supplier_name || '—'}</span>
                {p.expected_date && <span className="text-[#6B6B6B]"> · ETA {p.expected_date}</span>}
                <div className="text-[10px] text-[#6B6B6B] mt-0.5 truncate">{itemSummary}{more}</div>
              </div>
              <div className="font-mono text-[12px] text-right whitespace-nowrap">
                <span className="sensitive">RM {Number(p.total_amount || 0).toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          )
        })}
      </div>
      <div className="px-4 py-3 border-t border-[#F0EDE4] flex gap-2 bg-white">
        <a href="/purchase-orders?status=pending" className="px-3 py-1.5 bg-[#1A1A1A] text-white rounded text-[12px] hover:bg-black font-medium">Review &amp; approve</a>
        <a href="/purchase-orders" className="px-3 py-1.5 border border-[#D4D0C7] rounded text-[12px] hover:bg-[#FAFAF7]">Open all POs</a>
      </div>
    </div>
  )
}

function OverduePOsCard({ items }: { items: any[] }) {
  const today = new Date()
  return (
    <div className="border border-[#A53025] rounded-lg overflow-hidden bg-white">
      <div className="px-4 py-3 border-b border-[#A53025]/20 flex items-center justify-between">
        <div className="text-[14px] font-medium">Overdue Deliveries · {items.length} PO{items.length > 1 ? 's' : ''}</div>
        <span className="font-mono text-[9px] uppercase tracking-wider bg-[#F5DEDA] text-[#A53025] border border-[#A53025]/30 px-2 py-0.5 rounded">Follow up</span>
      </div>
      <div>
        {items.map((p: any, i: number) => {
          const days = p.expected_date ? Math.floor((today.getTime() - new Date(p.expected_date).getTime()) / 86400_000) : 0
          return (
            <div key={i} className="px-4 py-2.5 border-b border-[#F0EDE4] last:border-0 grid grid-cols-[180px_1fr_auto] gap-4 items-center text-[12px]">
              <div className="font-mono text-[12px] text-[#A53025] font-medium">{p.po_number}</div>
              <div className="font-mono text-[11px] text-[#3D3D3D]">
                <span className="sensitive">{p.supplier_name || '—'}</span>
                <span className="text-[#6B6B6B]"> · ETA {p.expected_date}</span>
              </div>
              <div className="font-mono text-[11px] text-right text-[#A53025] whitespace-nowrap">{days}d late</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WhatsAppDraftCard({ data }: { data: any }) {
  return (
    <div className="border border-[#4A6B3D] bg-[#F0F5ED] rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-[#4A6B3D]/10 border-b border-[#4A6B3D]/20 flex items-center justify-between">
        <div className="text-[12px] font-medium text-[#4A6B3D]">
          💬 WhatsApp draft → {data.recipient}
          {data.subject && <span className="text-[#6B6B6B]"> · {data.subject}</span>}
        </div>
        <span className="font-mono text-[9px] uppercase tracking-wider bg-[#4A6B3D] text-white px-1.5 py-0.5 rounded">Draft saved</span>
      </div>
      <div className="px-4 py-3 text-[13px] whitespace-pre-wrap leading-relaxed bg-white">
        {data.template}
      </div>
      <div className="px-4 py-2 border-t border-[#4A6B3D]/20 flex gap-2 bg-white">
        <button onClick={() => navigator.clipboard.writeText(data.template)} className="px-2.5 py-1 border border-[#D4D0C7] rounded text-[11px] hover:bg-[#FAFAF7]">📋 Copy</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(data.template)}`} target="_blank" rel="noreferrer" className="px-2.5 py-1 border border-[#4A6B3D] text-[#4A6B3D] rounded text-[11px] hover:bg-[#4A6B3D] hover:text-white transition-colors">Open in WhatsApp →</a>
      </div>
    </div>
  )
}
