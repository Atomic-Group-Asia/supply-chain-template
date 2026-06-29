import { supabaseAdmin } from './supabase'
import { readFGStockByBrandSku, readFGIncomingByBrandSku, readFGCommittedByBrandSku } from './fg-inventory'
import { VISIBLE_BRANDS } from './visible-brands'

// ============================================================================
// Tool definitions (Anthropic format) + executors
// ============================================================================

export type ToolResult = { success: true; data: any } | { success: false; error: string }

export const TOOLS = [
  {
    name: 'query_inventory',
    description: 'Get current FG stock levels. Returns closing on-hand, incoming (open FG POs pending+approved), committed (active reservations), and available = closing + incoming − committed, plus tier classification (critical/urgent/warning/watch/healthy) based on absolute available units. Summary block includes total_incoming + total_committed so the agent can answer "how much FG on the way / reserved".',
    input_schema: {
      type: 'object' as const,
      properties: {
        brand: { type: 'string', description: 'Brand filter (Nattome / Heartio / TPD / Stonecare / HooHoo). Optional.' },
        sku: { type: 'string', description: 'Specific SKU. Optional.' },
        low_stock_only: { type: 'boolean', description: 'Only return SKUs below safety stock.' },
        unit_tiers_only: { type: 'boolean', description: 'Only return SKUs in marketing-alert tiers (< 500 units). When true, tier is judged on PHYSICAL stock = closing − committed (incoming is ignored — empty shelf still means stop ads even if a PO is on the way). Use for Grace / Yong Sheng (marketing) view. Sorted by lowest physical stock first.' },
        incoming_only: { type: 'boolean', description: 'Only return SKUs with at least one open FG PO. Sorted by largest incoming qty first. Use to answer "what FG is on the way".' },
      },
    },
  },
  {
    name: 'query_purchase_decisions',
    description: 'Get SKUs that need PO drafting — stock-months calculation. Returns critical/review/healthy status per SKU. Use when user asks what to order, what to draft, what is critical.',
    input_schema: {
      type: 'object' as const,
      properties: {
        brand: { type: 'string', description: 'Brand filter. Optional.' },
        status: { type: 'string', enum: ['draft', 'review', 'healthy'], description: 'Only return SKUs in this status.' },
      },
    },
  },
  {
    name: 'query_pos',
    description: 'Get Purchase Orders by status. Use for "pending approvals", "overdue POs", "POs by supplier" etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'received', 'cancelled'] },
        entity: { type: 'string', enum: ['1PCT', 'NAT', 'HRT'] },
        overdue_only: { type: 'boolean', description: 'Only POs past expected_date.' },
      },
    },
  },
  {
    name: 'query_alerts',
    description: 'Get current alerts (low stock, overdue PO, expiry). Use when user asks about alerts, warnings, what needs attention.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', enum: ['low_stock', 'overdue', 'expiry'] },
        bucket: { type: 'string', enum: ['active', 'processing'], description: 'active = needs action; processing = PO already drafted' },
      },
    },
  },
  {
    name: 'query_batches',
    description: 'Get product batches with expiry dates. Use when user asks about expiry, batch tracking, shelf life.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sku: { type: 'string', description: 'Filter by SKU. Optional.' },
        expiring_within_days: { type: 'number', description: 'Only batches expiring within N days. Default 365.' },
      },
    },
  },
  {
    name: 'draft_whatsapp_message',
    description: 'Draft a WhatsApp message in the user\'s voice — for following up overdue POs, requesting urgent delivery, or chasing suppliers. Returns the draft text (does NOT send). The user reviews before sending.',
    input_schema: {
      type: 'object' as const,
      properties: {
        recipient_name: { type: 'string', description: 'Recipient name (e.g., Darren)' },
        subject: { type: 'string', description: 'Subject line, e.g., "PO-2026-038 follow-up"' },
        context: { type: 'string', description: 'What this message is about. The agent will draft the message based on this.' },
        tone: { type: 'string', enum: ['polite', 'urgent', 'firm'], description: 'Tone of the message' },
      },
      required: ['recipient_name', 'context'],
    },
  },
]

// Use the shared VISIBLE_BRANDS set so agent's view is consistent with the UI
const TRACKED_BRANDS = VISIBLE_BRANDS

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export async function executeTool(name: string, input: any): Promise<ToolResult> {
  try {
    switch (name) {
      case 'query_inventory':
        return await execQueryInventory(input)
      case 'query_purchase_decisions':
        return await execPurchaseDecisions(input)
      case 'query_pos':
        return await execQueryPOs(input)
      case 'query_alerts':
        return await execQueryAlerts(input)
      case 'query_batches':
        return await execQueryBatches(input)
      case 'draft_whatsapp_message':
        return execDraftWhatsapp(input)
      default:
        return { success: false, error: `Unknown tool: ${name}` }
    }
  } catch (e: any) {
    return { success: false, error: e.message || 'Tool execution failed' }
  }
}

// ============================================================================
// Tool executors
// ============================================================================

function classifyTier(available: number): 'critical' | 'urgent' | 'warning' | 'watch' | 'healthy' {
  if (available < 50) return 'critical'
  if (available < 100) return 'urgent'
  if (available < 300) return 'warning'
  if (available < 500) return 'watch'
  return 'healthy'
}

async function execQueryInventory({ brand, sku, low_stock_only, unit_tiers_only, incoming_only }: any): Promise<ToolResult> {
  const [stockMap, incomingMap, committedMap] = await Promise.all([
    readFGStockByBrandSku(),
    readFGIncomingByBrandSku(),
    readFGCommittedByBrandSku(),
  ])
  let q = supabaseAdmin.from('products').select('sku, brand, product_name, safety_stock_qty, moq, lead_time_days')
  if (brand) q = q.eq('brand', brand)
  if (sku) q = q.eq('sku', sku)
  const { data: products, error } = await q
  if (error) return { success: false, error: error.message }

  const rows = []
  let totalIncoming = 0
  let totalCommitted = 0
  for (const p of products || []) {
    if (!TRACKED_BRANDS.has(p.brand)) continue
    const k = `${p.brand}::${p.sku}`
    const closing = stockMap.get(k) || 0
    const incoming = incomingMap.get(k) || 0
    const committed = committedMap.get(k) || 0
    const available = closing + incoming - committed                // forward-looking
    const physical_available = Math.max(0, closing - committed)     // what's actually on the shelf RIGHT NOW (Grace / marketing view)
    totalIncoming += incoming
    totalCommitted += committed
    const safety = Number(p.safety_stock_qty) || 0
    const isLow = safety > 0 && available < safety
    // Marketing alerts (Grace/Yong Sheng) judge tier on PHYSICAL stock only —
    // "incoming +500 in 2 weeks" doesn't help when the shelf is empty today.
    // Other callers still tier on full available (forward-looking).
    const tierBasis = unit_tiers_only ? physical_available : available
    const tier = classifyTier(tierBasis)
    if (low_stock_only && !isLow) continue
    if (unit_tiers_only && tier === 'healthy') continue
    if (incoming_only && incoming <= 0) continue
    rows.push({
      sku: p.sku,
      brand: p.brand,
      product_name: p.product_name,
      closing,
      incoming,
      committed,
      available,                  // closing + incoming − committed (forward-looking)
      physical_available,         // closing − committed (shelf today, IGNORES incoming)
      safety,
      below_safety: isLow,
      tier,
      tier_basis: unit_tiers_only ? 'physical_available' : 'available',
      moq: p.moq,
      lead_time_days: p.lead_time_days,
    })
  }
  rows.sort((a, b) => {
    if (incoming_only) return b.incoming - a.incoming
    if (unit_tiers_only) return a.physical_available - b.physical_available
    return a.available - b.available
  })

  let summary: any = { total_incoming: totalIncoming, total_committed: totalCommitted }
  if (unit_tiers_only) {
    summary = { ...summary, critical: 0, urgent: 0, warning: 0, watch: 0, tier_basis: 'physical_available (closing − committed)' }
    for (const r of rows) summary[r.tier] = (summary[r.tier] || 0) + 1
  }
  return { success: true, data: { total: rows.length, summary, items: rows.slice(0, 50) } }
}

async function execPurchaseDecisions({ brand, status }: any): Promise<ToolResult> {
  // Reuse logic from purchase-decisions page
  const stockMap = await readFGStockByBrandSku()
  const [{ data: products }, { data: movements }, { data: settings }, { data: suppliers }, { data: activePos }] = await Promise.all([
    supabaseAdmin.from('products').select('sku, brand, product_name, safety_stock_qty, moq, lead_time_days, unit_cost, oem_supplier_code'),
    supabaseAdmin.from('stock_movements').select('brand, sku, date_start, out_qty').gte('date_start', new Date(Date.now() - 200 * 86400_000).toISOString().slice(0, 10)),
    supabaseAdmin.from('app_settings').select('*').eq('key', 'purchase_decision_thresholds').single(),
    supabaseAdmin.from('suppliers').select('supplier_code, supplier_name, payment_terms_fg'),
    supabaseAdmin.from('purchase_orders').select('po_number, items:purchase_order_items(sku)').in('status', ['pending', 'approved']),
  ])

  const supMap = new Map<string, { name: string; terms: string | null }>(
    (suppliers || []).map((s: any) => [s.supplier_code, { name: s.supplier_name, terms: s.payment_terms_fg }])
  )
  const skuPoMap = new Map<string, string>()
  for (const po of activePos || []) {
    for (const it of po.items || []) {
      if (it.sku && !skuPoMap.has(it.sku)) skuPoMap.set(it.sku, po.po_number)
    }
  }
  const th = (settings?.value as any) || { draft_po: 2.5, review: 3.5 }
  const DRAFT = Number(th.draft_po), REVIEW = Number(th.review)

  const monthly = new Map<string, Map<string, number>>()
  for (const m of movements || []) {
    if (!m.sku || !m.date_start || !m.out_qty) continue
    const d = new Date(m.date_start); if (isNaN(d.getTime())) continue
    const k = `${m.brand}::${m.sku}`, mk = monthKey(d)
    if (!monthly.has(k)) monthly.set(k, new Map())
    monthly.get(k)!.set(mk, (monthly.get(k)!.get(mk) || 0) + Number(m.out_qty || 0))
  }
  const today = new Date()
  function l3m(brand: string, sku: string) {
    const inner = monthly.get(`${brand}::${sku}`); if (!inner) return 0
    let s = 0
    for (let i = 0; i < 3; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i - 1, 1)
      s += inner.get(monthKey(d)) || 0
    }
    return s / 3
  }

  const rows: any[] = []
  for (const p of products || []) {
    if (!TRACKED_BRANDS.has(p.brand)) continue
    if (brand && p.brand !== brand) continue
    const avail = stockMap.get(`${p.brand}::${p.sku}`) || 0
    const basis = l3m(p.brand, p.sku)
    const stockMonths = basis > 0 ? avail / basis : 999
    let st: 'draft' | 'review' | 'healthy' = 'healthy'
    if (stockMonths < DRAFT) st = 'draft'
    else if (stockMonths < REVIEW) st = 'review'
    if (status && st !== status) continue
    // Compute suggested qty (3 months coverage, rounded up to 100, at least MOQ)
    let suggest: number | null = null
    if (st !== 'healthy' && basis > 0) {
      const need = Math.max(0, basis * 3 - avail)
      suggest = Math.max(Number(p.moq) || 0, Math.ceil(need / 100) * 100)
    }
    const sup = p.oem_supplier_code ? supMap.get(p.oem_supplier_code) : null
    rows.push({
      sku: p.sku,
      brand: p.brand,
      product_name: p.product_name,
      available: avail,
      l3m_avg: Math.round(basis),
      stock_months: Number(stockMonths.toFixed(2)),
      status: st,
      safety: p.safety_stock_qty,
      moq: p.moq,
      lead_time_days: p.lead_time_days,
      suggest_qty: suggest,
      unit_cost: Number(p.unit_cost) || 0,
      amount: suggest && p.unit_cost ? suggest * Number(p.unit_cost) : 0,
      supplier_name: sup?.name || null,
      payment_terms: sup?.terms || null,
      active_po: skuPoMap.get(p.sku) || null,
    })
  }
  rows.sort((a, b) => a.stock_months - b.stock_months)
  return { success: true, data: { total: rows.length, thresholds: { draft: DRAFT, review: REVIEW }, items: rows.slice(0, 30) } }
}

async function execQueryPOs({ status, entity, overdue_only }: any): Promise<ToolResult> {
  let q = supabaseAdmin.from('purchase_orders').select('id, po_number, entity_code, po_type, brands, supplier_name, status, total_amount, paid_amount, payment_status, expected_date, drafted_at, drafted_by, approved_by, items:purchase_order_items(sku, qty, product_name)').order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  if (entity) q = q.eq('entity_code', entity)
  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  let rows = data || []
  if (overdue_only) {
    const today = new Date().toISOString().slice(0, 10)
    rows = rows.filter((po: any) => po.status === 'approved' && po.expected_date && po.expected_date < today)
  }
  return { success: true, data: { total: rows.length, items: rows.slice(0, 30) } }
}

async function execQueryAlerts({ type, bucket }: any): Promise<ToolResult> {
  // Lightweight version — recompute on the fly
  const stockMap = await readFGStockByBrandSku()
  const [{ data: products }, { data: openPos }, { data: pendingPos }, { data: batches }] = await Promise.all([
    supabaseAdmin.from('products').select('sku, brand, product_name, safety_stock_qty, moq'),
    supabaseAdmin.from('purchase_orders').select('po_number, expected_date, status, items:purchase_order_items(sku, qty, product_name), supplier_name').eq('status', 'approved'),
    supabaseAdmin.from('purchase_orders').select('po_number, status, items:purchase_order_items(sku, qty)').eq('status', 'pending'),
    supabaseAdmin.from('batches').select('*').eq('status', 'active'),
  ])
  const activePO = new Map<string, string>()
  for (const po of [...(openPos || []), ...(pendingPos || [])]) {
    for (const it of po.items || []) if (it.sku && !activePO.has(it.sku)) activePO.set(it.sku, po.po_number)
  }
  const today = new Date()
  const alerts: any[] = []
  // low stock
  if (!type || type === 'low_stock') {
    for (const p of products || []) {
      if (!TRACKED_BRANDS.has(p.brand)) continue
      const avail = stockMap.get(`${p.brand}::${p.sku}`) || 0
      const safety = Number(p.safety_stock_qty) || 0
      if (safety > 0 && avail < safety) {
        const po = activePO.get(p.sku)
        const b = po ? 'processing' : 'active'
        if (bucket && bucket !== b) continue
        alerts.push({ type: 'low_stock', sku: p.sku, brand: p.brand, product_name: p.product_name, available: avail, safety, bucket: b, po_ref: po })
      }
    }
  }
  // overdue
  if (!type || type === 'overdue') {
    for (const po of openPos || []) {
      if (!po.expected_date) continue
      const d = new Date(po.expected_date)
      const overdue = Math.floor((today.getTime() - d.getTime()) / 86400_000)
      if (overdue > 0) {
        if (bucket && bucket !== 'active') continue
        alerts.push({ type: 'overdue', po_number: po.po_number, days_overdue: overdue, supplier: po.supplier_name, bucket: 'active' })
      }
    }
  }
  // expiry
  if (!type || type === 'expiry') {
    for (const b of batches || []) {
      const d = new Date(b.expiry_date); if (isNaN(d.getTime())) continue
      const days = Math.floor((d.getTime() - today.getTime()) / 86400_000)
      if (days > 365) continue
      if (bucket && bucket !== 'active') continue
      alerts.push({ type: 'expiry', sku: b.sku, batch_number: b.batch_number, days_until_expiry: days, qty: b.qty_remaining ?? b.qty, bucket: 'active' })
    }
  }
  return { success: true, data: { total: alerts.length, items: alerts.slice(0, 50) } }
}

function execDraftWhatsapp({ recipient_name, subject, context, tone = 'polite' }: any): ToolResult {
  const opening = tone === 'urgent'
    ? `Hi ${recipient_name},\n\nUrgent — `
    : tone === 'firm'
    ? `Hi ${recipient_name},\n\n`
    : `Hi ${recipient_name},\n\n`
  // Return a structured draft. The agent will rewrite this naturally in the chat.
  // Here we just return a starter template + the context so the agent can refine.
  return {
    success: true,
    data: {
      type: 'whatsapp_draft',
      recipient: recipient_name,
      subject: subject || null,
      tone,
      template: `${opening}${context}\n\nThanks.`,
      instructions: 'Refine this draft in the user\'s voice (Your Company ops, professional, concise). Format as a card in your reply.',
    },
  }
}

async function execQueryBatches({ sku, expiring_within_days = 365 }: any): Promise<ToolResult> {
  let q = supabaseAdmin.from('batches').select('*').eq('status', 'active').order('expiry_date', { ascending: true })
  if (sku) q = q.eq('sku', sku)
  const { data, error } = await q
  if (error) return { success: false, error: error.message }
  const today = Date.now()
  const filtered = (data || []).filter((b: any) => {
    const days = Math.floor((new Date(b.expiry_date).getTime() - today) / 86400_000)
    return days <= expiring_within_days
  })
  return { success: true, data: { total: filtered.length, items: filtered.slice(0, 30) } }
}
