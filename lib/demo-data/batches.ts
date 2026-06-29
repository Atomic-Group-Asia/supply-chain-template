// Demo batches — FEFO ledger.
// One Brand C SKU intentionally has a batch nearing expiry (3 months out)
// to demo the expiry-alert panel.

export const demoBatches = [
  // Brand A · A-001 (healthy)
  {
    id: 'b-1', sku: 'A-001', brand: 'Brand A',
    batch_number: 'A001-2025-12',
    manufactured_date: '2025-12-01', expiry_date: '2027-12-01',
    qty: 2400, qty_remaining: 1850,
    warehouse: 'HQ', status: 'active', notes: null,
    created_at: '2025-12-15T00:00:00Z', updated_at: '2026-06-20T00:00:00Z',
  },
  {
    id: 'b-2', sku: 'A-001', brand: 'Brand A',
    batch_number: 'A001-2026-03',
    manufactured_date: '2026-03-15', expiry_date: '2028-03-15',
    qty: 3000, qty_remaining: 2900,
    warehouse: 'HQ', status: 'active', notes: null,
    created_at: '2026-03-25T00:00:00Z', updated_at: '2026-06-20T00:00:00Z',
  },
  // Brand A · A-002
  {
    id: 'b-3', sku: 'A-002', brand: 'Brand A',
    batch_number: 'A002-2026-02',
    manufactured_date: '2026-02-10', expiry_date: '2028-02-10',
    qty: 1200, qty_remaining: 950,
    warehouse: 'HQ', status: 'active', notes: null,
    created_at: '2026-02-20T00:00:00Z', updated_at: '2026-06-20T00:00:00Z',
  },
  // Brand B · B-001 (low stock)
  {
    id: 'b-4', sku: 'B-001', brand: 'Brand B',
    batch_number: 'B001-2025-11',
    manufactured_date: '2025-11-15', expiry_date: '2027-11-15',
    qty: 1000, qty_remaining: 280,
    warehouse: 'HQ', status: 'active',
    notes: 'Below safety stock — see PO-2026-003',
    created_at: '2025-11-25T00:00:00Z', updated_at: '2026-06-20T00:00:00Z',
  },
  // Brand C · C-001 (expiring soon — KEY DEMO)
  {
    id: 'b-5', sku: 'C-001', brand: 'Brand C',
    batch_number: 'C001-2025-04',
    manufactured_date: '2025-04-01', expiry_date: '2026-10-01',
    qty: 1200, qty_remaining: 380,
    warehouse: 'HQ', status: 'active',
    notes: '⚠ Expires in ~3 months — prioritise this batch',
    created_at: '2025-04-10T00:00:00Z', updated_at: '2026-06-20T00:00:00Z',
  },
  {
    id: 'b-6', sku: 'C-001', brand: 'Brand C',
    batch_number: 'C001-2026-01',
    manufactured_date: '2026-01-15', expiry_date: '2027-07-15',
    qty: 1500, qty_remaining: 1500,
    warehouse: 'HQ', status: 'active', notes: null,
    created_at: '2026-01-25T00:00:00Z', updated_at: '2026-06-20T00:00:00Z',
  },
  // Brand C · C-002
  {
    id: 'b-7', sku: 'C-002', brand: 'Brand C',
    batch_number: 'C002-2025-10',
    manufactured_date: '2025-10-01', expiry_date: '2027-04-01',
    qty: 1000, qty_remaining: 620,
    warehouse: 'Retailer', status: 'active', notes: null,
    created_at: '2025-10-10T00:00:00Z', updated_at: '2026-06-20T00:00:00Z',
  },
  // Historic depleted batch (for ledger completeness)
  {
    id: 'b-8', sku: 'A-001', brand: 'Brand A',
    batch_number: 'A001-2025-06',
    manufactured_date: '2025-06-01', expiry_date: '2027-06-01',
    qty: 1800, qty_remaining: 0,
    warehouse: 'HQ', status: 'depleted', notes: null,
    created_at: '2025-06-10T00:00:00Z', updated_at: '2026-05-30T00:00:00Z',
  },
]
