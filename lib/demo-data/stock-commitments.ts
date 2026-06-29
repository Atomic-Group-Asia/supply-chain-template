// Demo stock commitments — reservations against available stock.
// Mix of active (held) and fulfilled (released).

export const demoStockCommitments = [
  {
    id: 'sc-1', product_sku: 'A-001', commitment_type: 'wms_order',
    qty: 200, reserved_for: 'WMS-2026-0612',
    required_by_date: '2026-07-10', required_by_date_end: null,
    created_by: 'demo-user', notes: 'B2B retail order — pending shipment',
    status: 'active', wms_order_id: 'WMS-2026-0612',
    commitment_group_id: null,
    created_at: '2026-06-12T03:00:00Z', updated_at: '2026-06-12T03:00:00Z',
  },
  {
    id: 'sc-2', product_sku: 'A-002', commitment_type: 'event',
    qty: 100, reserved_for: 'Wellness Expo 2026',
    required_by_date: '2026-08-01', required_by_date_end: '2026-08-05',
    created_by: 'demo-user', notes: 'Trade show inventory',
    status: 'active', wms_order_id: null,
    commitment_group_id: null,
    created_at: '2026-06-18T03:00:00Z', updated_at: '2026-06-18T03:00:00Z',
  },
  {
    id: 'sc-3', product_sku: 'C-001', commitment_type: 'wms_order',
    qty: 150, reserved_for: 'WMS-2026-0520',
    required_by_date: '2026-06-15', required_by_date_end: null,
    created_by: 'demo-user', notes: null,
    status: 'fulfilled', wms_order_id: 'WMS-2026-0520',
    commitment_group_id: null,
    created_at: '2026-05-20T03:00:00Z', updated_at: '2026-06-15T08:00:00Z',
  },
  {
    id: 'sc-4', product_sku: 'B-002', commitment_type: 'marketing',
    qty: 80, reserved_for: 'PR / Influencer sampling Q3',
    required_by_date: '2026-07-15', required_by_date_end: null,
    created_by: 'demo-user', notes: '40 to KOLs, 40 to media',
    status: 'active', wms_order_id: null,
    commitment_group_id: null,
    created_at: '2026-06-20T03:00:00Z', updated_at: '2026-06-20T03:00:00Z',
  },
]
