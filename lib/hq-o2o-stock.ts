// ============================================================================
//  HQ / Retailer stock helpers (demo template)
//
//  Reads from the mocked `daily_stock_current` table. The production app
//  pulled this from a Google Sheet — that integration is disabled here.
// ============================================================================

import { supabaseAdmin } from './supabase'
import { WAREHOUSES } from './config'

export type StockRow = {
  brand: string
  sku: string
  product_name: string
  qty: number
}

export type RetailerShop = {
  brand: string
  shop_code: string
  shop_name: string
  total_qty: number
  skus: { sku: string; product_name: string; qty: number }[]
}

export type RetailerPivot = {
  brand: string
  sku: string
  product_name: string
  total: number
  per_shop: { shop_code: string; shop_name: string; qty: number }[]
}

async function fetchWarehouseRows(warehouse: string): Promise<StockRow[]> {
  const [{ data: stockRows }, { data: products }] = await Promise.all([
    supabaseAdmin.from('daily_stock_current').select('*').eq('warehouse', warehouse),
    supabaseAdmin.from('products').select('sku, product_name'),
  ])
  const nameBySku: Record<string, string> = {}
  for (const p of (products as any[]) || []) nameBySku[p.sku] = p.product_name
  return ((stockRows as any[]) || []).map(r => ({
    brand: r.brand,
    sku: r.sku,
    product_name: nameBySku[r.sku] || r.sku,
    qty: Number(r.qty || 0),
  }))
}

export async function readHQStock(): Promise<StockRow[]> {
  return fetchWarehouseRows(WAREHOUSES.hq)
}

// Legacy aliases kept so existing imports compile.
export const readO2OShops = async (): Promise<RetailerShop[]> => readRetailerShops()
export const readO2OPivot = async (): Promise<RetailerPivot[]> => readRetailerPivot()
// The /o2o-stock page imports `readO2OStock` — return flat rows.
export async function readO2OStock(): Promise<StockRow[]> {
  return fetchWarehouseRows(WAREHOUSES.retailer)
}

// Single fake "shop" representing the Retailer warehouse. The production
// version pivoted across multiple shops per brand; the demo flattens to
// one virtual shop so the UI still renders something sensible.
export async function readRetailerShops(): Promise<RetailerShop[]> {
  const rows = await fetchWarehouseRows(WAREHOUSES.retailer)
  const byBrand: Record<string, RetailerShop> = {}
  for (const r of rows) {
    if (!byBrand[r.brand]) {
      byBrand[r.brand] = {
        brand: r.brand, shop_code: 'SHOP-01', shop_name: 'Demo Shop',
        total_qty: 0, skus: [],
      }
    }
    byBrand[r.brand].skus.push({ sku: r.sku, product_name: r.product_name, qty: r.qty })
    byBrand[r.brand].total_qty += r.qty
  }
  return Object.values(byBrand)
}

export async function readRetailerPivot(): Promise<RetailerPivot[]> {
  const rows = await fetchWarehouseRows(WAREHOUSES.retailer)
  return rows.map(r => ({
    brand: r.brand,
    sku: r.sku,
    product_name: r.product_name,
    total: r.qty,
    per_shop: [{ shop_code: 'SHOP-01', shop_name: 'Demo Shop', qty: r.qty }],
  }))
}
