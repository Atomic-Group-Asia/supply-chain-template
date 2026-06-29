// Demo daily_stock_current — latest qty snapshot per (brand, sku).
// Two warehouses: HQ (main) and Retailer (consignment / O2O equivalent).
// In real production this is upserted nightly from Excel.

type Row = { brand: string; sku: string; qty: number; warehouse?: string }

const HQ: Row[] = [
  // Brand A — healthy
  { brand: 'Brand A', sku: 'A-001', qty: 4750 },
  { brand: 'Brand A', sku: 'A-002', qty: 3200 },
  { brand: 'Brand A', sku: 'A-003', qty: 2400 },
  { brand: 'Brand A', sku: 'A-004', qty: 1850 },
  { brand: 'Brand A', sku: 'A-005', qty: 1200 },
  { brand: 'Brand A', sku: 'A-006', qty: 1600 },
  // Brand B — one critical
  { brand: 'Brand B', sku: 'B-001', qty: 280 },   // CRITICAL — below safety + alert_critical_qty
  { brand: 'Brand B', sku: 'B-002', qty: 1450 },
  { brand: 'Brand B', sku: 'B-003', qty: 1800 },
  { brand: 'Brand B', sku: 'B-004', qty: 2200 },
  { brand: 'Brand B', sku: 'B-005', qty: 1100 },
  // Brand C
  { brand: 'Brand C', sku: 'C-001', qty: 1880 },
  { brand: 'Brand C', sku: 'C-002', qty: 1450 },
  { brand: 'Brand C', sku: 'C-003', qty: 2100 },
  { brand: 'Brand C', sku: 'C-004', qty: 900 },
]

const RETAILER: Row[] = HQ.map(r => ({ ...r, qty: Math.round(r.qty * 0.3) }))

const ts = '2026-06-26T03:00:00Z'
export const demoDailyStock = [
  ...HQ.map(r => ({ ...r, warehouse: 'HQ', updated_at: ts })),
  ...RETAILER.map(r => ({ ...r, warehouse: 'Retailer', updated_at: ts })),
]
