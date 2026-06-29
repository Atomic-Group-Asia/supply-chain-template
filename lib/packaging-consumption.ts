/**
 * Packaging consumption on FG PO receipt.
 *
 * When user marks an FG PO as received (or partially received), the BOM
 * tells us how much packaging was consumed at the OEM to produce that
 * batch of FG. We deduct from packaging.stock_balance and write an audit
 * row to packaging_movements for every BOM component.
 *
 * Cumulative model: callers send absolute received_qty per line. To
 * avoid double-counting, this helper takes (oldQty, newQty) deltas.
 */

import { supabaseAdmin } from './supabase'

export type ConsumptionPreview = {
  fg_sku: string
  fg_delta: number
  packaging_code: string
  packaging_name: string
  qty_per_unit: number
  consume_qty: number
  current_stock: number
  shortfall: number              // >0 if consumption exceeds current_stock
}

export type LineDelta = {
  line_id: string
  fg_sku: string | null
  old_received: number
  new_received: number
}

/**
 * Build a preview of what packaging will be consumed. Pure read — no
 * writes. Used to show the user before confirming + by the apply step.
 */
export async function previewConsumption(deltas: LineDelta[]): Promise<ConsumptionPreview[]> {
  const positive = deltas.filter(d => d.fg_sku && (d.new_received - d.old_received) > 0)
  if (positive.length === 0) return []

  const fgSkus = Array.from(new Set(positive.map(d => d.fg_sku as string)))
  const [{ data: bomRows }, { data: pkgRows }] = await Promise.all([
    supabaseAdmin.from('bom').select('product_sku, packaging_code, qty_per_unit').in('product_sku', fgSkus),
    supabaseAdmin.from('packaging').select('packaging_code, packaging_name, stock_balance'),
  ])

  const pkgMap = new Map<string, { name: string; stock: number }>()
  for (const p of pkgRows || []) {
    pkgMap.set(p.packaging_code, { name: p.packaging_name || p.packaging_code, stock: Number(p.stock_balance) || 0 })
  }

  // Aggregate: same packaging may be consumed by multiple FG lines in the same receipt
  const agg = new Map<string, ConsumptionPreview>()
  for (const d of positive) {
    const delta = d.new_received - d.old_received
    const bomForFg = (bomRows || []).filter(b => b.product_sku === d.fg_sku)
    for (const b of bomForFg) {
      const qtyPerUnit = Number(b.qty_per_unit) || 0
      if (qtyPerUnit <= 0) continue
      const consume = qtyPerUnit * delta
      const pkg = pkgMap.get(b.packaging_code)
      const key = `${d.fg_sku}::${b.packaging_code}`
      const existing = agg.get(key)
      if (existing) {
        existing.consume_qty += consume
      } else {
        agg.set(key, {
          fg_sku: d.fg_sku as string,
          fg_delta: delta,
          packaging_code: b.packaging_code,
          packaging_name: pkg?.name || b.packaging_code,
          qty_per_unit: qtyPerUnit,
          consume_qty: consume,
          current_stock: pkg?.stock ?? 0,
          shortfall: 0,
        })
      }
    }
  }

  // Compute shortfall by total per packaging_code (not per fg_sku, since
  // the same packaging may be drawn by multiple FG lines in one PO)
  const totalConsumedByCode = new Map<string, number>()
  for (const v of agg.values()) {
    totalConsumedByCode.set(v.packaging_code, (totalConsumedByCode.get(v.packaging_code) || 0) + v.consume_qty)
  }
  for (const v of agg.values()) {
    const totalC = totalConsumedByCode.get(v.packaging_code) || 0
    v.shortfall = Math.max(0, totalC - v.current_stock)
  }

  return Array.from(agg.values()).sort((a, b) =>
    a.fg_sku === b.fg_sku ? a.packaging_code.localeCompare(b.packaging_code) : a.fg_sku.localeCompare(b.fg_sku)
  )
}

/**
 * Apply consumption: deduct stock_balance + write packaging_movements rows.
 * Allows negative balance (shortfall) — UI should warn the user but not block,
 * since the goods clearly were produced (and the count discrepancy is real).
 */
export async function applyConsumption({
  poId,
  deltas,
  actor,
}: {
  poId: string
  deltas: LineDelta[]
  actor: string | null
}): Promise<{ consumed: ConsumptionPreview[]; errors: string[] }> {
  const errors: string[] = []
  const preview = await previewConsumption(deltas)
  if (preview.length === 0) return { consumed: [], errors }

  // Re-fetch BOM rows so we can capture qty_per_unit + bom snapshot
  const fgSkus = Array.from(new Set(preview.map(p => p.fg_sku)))
  const { data: bomRows } = await supabaseAdmin
    .from('bom').select('product_sku, packaging_code, qty_per_unit').in('product_sku', fgSkus)

  // Group deltas by FG sku for line-id lookup
  const lineByFg = new Map<string, LineDelta[]>()
  for (const d of deltas) {
    if (!d.fg_sku) continue
    const arr = lineByFg.get(d.fg_sku) || []
    arr.push(d); lineByFg.set(d.fg_sku, arr)
  }

  // 1. Deduct stock_balance per packaging_code (sum across all FG lines)
  const deductByCode = new Map<string, number>()
  for (const p of preview) {
    deductByCode.set(p.packaging_code, (deductByCode.get(p.packaging_code) || 0) + p.consume_qty)
  }
  for (const [code, qty] of deductByCode) {
    const { data: pkg, error: pErr } = await supabaseAdmin
      .from('packaging').select('stock_balance').eq('packaging_code', code).single()
    if (pErr || !pkg) { errors.push(`Lookup ${code}: ${pErr?.message || 'not found'}`); continue }
    const newBal = (Number(pkg.stock_balance) || 0) - qty
    const { error: uErr } = await supabaseAdmin
      .from('packaging').update({ stock_balance: newBal }).eq('packaging_code', code)
    if (uErr) errors.push(`Update ${code}: ${uErr.message}`)
  }

  // 2. Write one movement row per (fg_sku, packaging_code) pair
  const movementRows: any[] = []
  for (const p of preview) {
    const bom = (bomRows || []).find(b => b.product_sku === p.fg_sku && b.packaging_code === p.packaging_code)
    const fgLines = lineByFg.get(p.fg_sku) || []
    const sourceLineId = fgLines[0]?.line_id || null
    movementRows.push({
      packaging_code: p.packaging_code,
      movement_type: 'consumption',
      qty_delta: -p.consume_qty,
      reason: 'fg_po_receipt',
      source_po_id: poId,
      source_po_line_id: sourceLineId,
      fg_sku: p.fg_sku,
      fg_qty: p.fg_delta,
      qty_per_unit: Number(bom?.qty_per_unit) || p.qty_per_unit,
      created_by: actor,
    })
  }
  if (movementRows.length > 0) {
    const { error: mErr } = await supabaseAdmin.from('packaging_movements').insert(movementRows)
    if (mErr) errors.push(`Movements insert: ${mErr.message}`)
  }

  return { consumed: preview, errors }
}
