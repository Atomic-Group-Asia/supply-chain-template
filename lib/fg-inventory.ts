// ============================================================================
//  FG Inventory data helpers (demo template).
//
//  All sources are the in-memory mock tables. The production version of this
//  file had a switchable backend (daily_stock_current vs Google Sheet
//  WH_Summary). In the demo we always read from the mock daily_stock_current.
// ============================================================================

import { supabaseAdmin } from './supabase'
import { WAREHOUSES } from './config'

export type FGStockRow = {
  brand: string
  sku: string
  product_name: string
  closing_stock: number | null
}

export function normalizeBrand(brand: string): string {
  return (brand || '').trim()
}

export function brandKey(brand: string): string {
  return normalizeBrand(brand)
}

function bsKey(brand: string, sku: string): string {
  return `${normalizeBrand(brand)}::${sku}`
}

// HQ stock per (brand, sku)
export async function readFGStockByBrandSku(): Promise<Map<string, number>> {
  const { data } = await supabaseAdmin.from('daily_stock_current').select('*')
    .eq('warehouse', WAREHOUSES.hq)
  const map = new Map<string, number>()
  for (const r of (data as any[]) || []) {
    map.set(bsKey(r.brand, r.sku), Number(r.qty || 0))
  }
  return map
}

// All warehouses combined (HQ + Retailer)
export async function readDailyStockAllBrands(): Promise<Map<string, number>> {
  const { data } = await supabaseAdmin.from('daily_stock_current').select('*')
  const map = new Map<string, number>()
  for (const r of (data as any[]) || []) {
    const k = bsKey(r.brand, r.sku)
    map.set(k, (map.get(k) || 0) + Number(r.qty || 0))
  }
  return map
}

export const readAllDailyStock = readDailyStockAllBrands

export async function readWHSummaryAvailable(): Promise<Map<string, number>> {
  return readFGStockByBrandSku()
}

export function invalidateStockCache() { /* no cache in demo */ }
export function invalidateWHSummaryCache() { /* no cache in demo */ }
export function invalidateSkuMappingCache() { /* no cache in demo */ }

// SKU mapping — in the production app this came from a separate GSheet tab.
// Here we derive it from the products table.
export type SkuMappingEntry = {
  brand: string
  sku: string
  product_name: string
  category?: string
}
export async function readSkuMapping(): Promise<SkuMappingEntry[]> {
  const { data } = await supabaseAdmin.from('products').select('brand, sku, product_name')
  return ((data as any[]) || []).map(p => ({
    brand: p.brand, sku: p.sku, product_name: p.product_name, category: undefined,
  }))
}

export type AnalyticsEntry = {
  brand: string
  sku: string
  l1m: number
  l3m: number
  l6m: number
}
export async function readAnalyticsByBrandSku(): Promise<Map<string, AnalyticsEntry>> {
  // Derived in the demo from stock_movements monthly aggregates.
  const { data } = await supabaseAdmin.from('stock_movements').select('*')
  const byKey = new Map<string, AnalyticsEntry>()
  const today = new Date()
  function monthKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const monthly = new Map<string, Map<string, number>>()
  for (const m of (data as any[]) || []) {
    if (!m.brand || !m.sku) continue
    const d = new Date(m.date_start); if (isNaN(d.getTime())) continue
    const k = bsKey(m.brand, m.sku)
    if (!monthly.has(k)) monthly.set(k, new Map())
    monthly.get(k)!.set(monthKey(d), Number(m.out_qty || 0))
  }
  function avgOver(k: string, months: number) {
    const inner = monthly.get(k); if (!inner) return 0
    let s = 0
    for (let i = 0; i < months; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i - 1, 1)
      s += inner.get(monthKey(d)) || 0
    }
    return months > 0 ? s / months : 0
  }
  for (const k of monthly.keys()) {
    const [brand, sku] = k.split('::')
    byKey.set(k, { brand, sku, l1m: avgOver(k, 1), l3m: avgOver(k, 3), l6m: avgOver(k, 6) })
  }
  return byKey
}

export type Batch = {
  id: string
  brand: string
  sku: string
  batch_number: string
  manufactured_date: string | null
  expiry_date: string | null
  qty: number
  qty_remaining: number
  warehouse: string
  status: string
}
export async function readBatchesByBrandSku(): Promise<Map<string, Batch[]>> {
  const { data } = await supabaseAdmin.from('batches').select('*').eq('status', 'active')
  const map = new Map<string, Batch[]>()
  for (const b of (data as any[]) || []) {
    const k = bsKey(b.brand, b.sku)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(b)
  }
  return map
}

// Incoming = open PO line qty (status pending / approved / partial_received)
export async function readFGIncomingByBrandSku(excludePoId?: string): Promise<Map<string, number>> {
  const { data: pos } = await supabaseAdmin.from('purchase_orders')
    .select('*, items:purchase_order_items(*)')
    .in('status', ['pending', 'approved', 'partial_received'])
  const map = new Map<string, number>()
  for (const po of (pos as any[]) || []) {
    if (excludePoId && po.id === excludePoId) continue
    for (const it of po.items || []) {
      if (!it.brand || !it.sku) continue
      const outstanding = Number(it.qty || 0) - Number(it.received_qty || 0)
      if (outstanding <= 0) continue
      const k = bsKey(it.brand, it.sku)
      map.set(k, (map.get(k) || 0) + outstanding)
    }
  }
  return map
}

export async function readFGIncomingETAByBrandSku(): Promise<Map<string, string>> {
  const { data: pos } = await supabaseAdmin.from('purchase_orders')
    .select('*, items:purchase_order_items(*)')
    .in('status', ['pending', 'approved', 'partial_received'])
  const map = new Map<string, string>()
  for (const po of (pos as any[]) || []) {
    for (const it of po.items || []) {
      if (!it.brand || !it.sku) continue
      const k = bsKey(it.brand, it.sku)
      const eta = it.expected_date || po.expected_date
      if (!eta) continue
      const existing = map.get(k)
      if (!existing || eta < existing) map.set(k, eta)
    }
  }
  return map
}

export async function readFGCommittedByBrandSku(): Promise<Map<string, number>> {
  // Map (brand, sku) → total active committed qty. In the demo, commitments
  // store product_sku; we derive brand by looking up the product.
  const [{ data: commits }, { data: products }] = await Promise.all([
    supabaseAdmin.from('stock_commitments').select('product_sku, qty, status').eq('status', 'active'),
    supabaseAdmin.from('products').select('sku, brand'),
  ])
  const brandBySku: Record<string, string> = {}
  for (const p of (products as any[]) || []) brandBySku[p.sku] = p.brand
  const map = new Map<string, number>()
  for (const c of (commits as any[]) || []) {
    const brand = brandBySku[c.product_sku]; if (!brand) continue
    const k = bsKey(brand, c.product_sku)
    map.set(k, (map.get(k) || 0) + Number(c.qty || 0))
  }
  return map
}
