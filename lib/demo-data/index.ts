// Central registry of all demo tables, keyed by Supabase table name.
// The mock client in lib/supabase.ts looks up tables from this map.
//
// All arrays are deep-cloned at module load so in-memory mutations
// (insert / update / delete via the mock client) don't bleed across
// hot-reloads in development.

import { demoSuppliers } from './suppliers'
import { demoProducts } from './products'
import { demoPackaging } from './packaging'
import { demoBom } from './bom'
import { demoPurchaseOrders, demoPurchaseOrderItems } from './purchase-orders'
import { demoBatches } from './batches'
import { demoStockMovements } from './stock-movements'
import { demoDailyStock } from './daily-stock'
import { demoStockCommitments } from './stock-commitments'
import { demoBrandAlertSettings } from './brand-alert-settings'

function clone<T>(rows: T[]): T[] {
  return JSON.parse(JSON.stringify(rows))
}

// Mutable per-process store. Reset on full server restart.
export const demoTables: Record<string, any[]> = {
  suppliers: clone(demoSuppliers),
  products: clone(demoProducts),
  packaging: clone(demoPackaging),
  bom: clone(demoBom),
  purchase_orders: clone(demoPurchaseOrders),
  purchase_order_items: clone(demoPurchaseOrderItems),
  batches: clone(demoBatches),
  stock_movements: clone(demoStockMovements),
  daily_stock_current: clone(demoDailyStock),
  stock_commitments: clone(demoStockCommitments),
  brand_alert_settings: clone(demoBrandAlertSettings),
  // Tables we don't seed but accept writes against (so the UI doesn't crash):
  stock_upload_log: [],
  po_invoices: [],
  po_invoice_items: [],
  commitment_attachments: [],
  packaging_movements: [],
  agent_conversations: [],
  agent_messages: [],
  audit_log: [],
}

// Foreign-key map for nested selects: { childTable: { parentColumnInChild: parentTable } }
// Mirrors the production schema. Only the joins actually used by the app are listed.
export const FK_MAP: Record<string, Record<string, string>> = {
  purchase_order_items: { po_id: 'purchase_orders' },
}
