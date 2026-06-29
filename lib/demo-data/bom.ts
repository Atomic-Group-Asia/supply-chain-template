// Demo BOM — each FG SKU maps to 1-2 packaging lines.

export const demoBom = [
  // Brand A
  { id: 'bom-1', product_sku: 'A-001', packaging_code: 'BOX-A1', qty_per_unit: 1, type: 'main', source: 'OEM', notes: null, created_at: '2024-06-01T00:00:00Z', updated_at: '2024-06-01T00:00:00Z' },
  { id: 'bom-2', product_sku: 'A-001', packaging_code: 'FOIL-A1', qty_per_unit: 30, type: 'sachet', source: 'OEM', notes: '30 sachets per unit', created_at: '2024-06-01T00:00:00Z', updated_at: '2024-06-01T00:00:00Z' },
  { id: 'bom-3', product_sku: 'A-002', packaging_code: 'BOX-A2', qty_per_unit: 1, type: 'main', source: 'OEM', notes: null, created_at: '2024-08-01T00:00:00Z', updated_at: '2024-08-01T00:00:00Z' },
  { id: 'bom-4', product_sku: 'A-002', packaging_code: 'FOIL-A1', qty_per_unit: 60, type: 'sachet', source: 'OEM', notes: '60 sachets per unit', created_at: '2024-08-01T00:00:00Z', updated_at: '2024-08-01T00:00:00Z' },
  { id: 'bom-5', product_sku: 'A-003', packaging_code: 'BTL-A1', qty_per_unit: 1, type: 'main', source: 'OEM', notes: null, created_at: '2024-10-01T00:00:00Z', updated_at: '2024-10-01T00:00:00Z' },
  { id: 'bom-6', product_sku: 'A-004', packaging_code: 'BTL-A2', qty_per_unit: 1, type: 'main', source: 'OEM', notes: null, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
  { id: 'bom-7', product_sku: 'A-005', packaging_code: 'FOIL-A1', qty_per_unit: 15, type: 'sachet', source: 'OEM', notes: '15 sachets per unit', created_at: '2025-03-01T00:00:00Z', updated_at: '2025-03-01T00:00:00Z' },
  { id: 'bom-8', product_sku: 'A-006', packaging_code: 'BTL-A2', qty_per_unit: 1, type: 'main', source: 'OEM', notes: '50ml fill', created_at: '2025-05-01T00:00:00Z', updated_at: '2025-05-01T00:00:00Z' },
  // Brand B
  { id: 'bom-9', product_sku: 'B-001', packaging_code: 'BTL-B1', qty_per_unit: 1, type: 'main', source: 'OEM', notes: null, created_at: '2024-09-01T00:00:00Z', updated_at: '2024-09-01T00:00:00Z' },
  { id: 'bom-10', product_sku: 'B-001', packaging_code: 'BOX-B1', qty_per_unit: 1, type: 'main', source: 'OEM', notes: 'Outer box', created_at: '2024-09-01T00:00:00Z', updated_at: '2024-09-01T00:00:00Z' },
  { id: 'bom-11', product_sku: 'B-001', packaging_code: 'LBL-B1', qty_per_unit: 1, type: 'label', source: 'OEM', notes: null, created_at: '2024-09-01T00:00:00Z', updated_at: '2024-09-01T00:00:00Z' },
  { id: 'bom-12', product_sku: 'B-002', packaging_code: 'BOX-B1', qty_per_unit: 1, type: 'main', source: 'OEM', notes: null, created_at: '2024-09-01T00:00:00Z', updated_at: '2024-09-01T00:00:00Z' },
  { id: 'bom-13', product_sku: 'B-002', packaging_code: 'LBL-B1', qty_per_unit: 1, type: 'label', source: 'OEM', notes: null, created_at: '2024-09-01T00:00:00Z', updated_at: '2024-09-01T00:00:00Z' },
  { id: 'bom-14', product_sku: 'B-003', packaging_code: 'BOX-B1', qty_per_unit: 1, type: 'main', source: 'OEM', notes: null, created_at: '2024-11-01T00:00:00Z', updated_at: '2024-11-01T00:00:00Z' },
  { id: 'bom-15', product_sku: 'B-004', packaging_code: 'BOX-B1', qty_per_unit: 1, type: 'main', source: 'OEM', notes: null, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-01-01T00:00:00Z' },
  { id: 'bom-16', product_sku: 'B-005', packaging_code: 'BOX-B1', qty_per_unit: 1, type: 'main', source: 'OEM', notes: null, created_at: '2025-04-01T00:00:00Z', updated_at: '2025-04-01T00:00:00Z' },
  // Brand C
  { id: 'bom-17', product_sku: 'C-001', packaging_code: 'BOX-C1', qty_per_unit: 1, type: 'main', source: 'OEM', notes: null, created_at: '2024-07-01T00:00:00Z', updated_at: '2024-07-01T00:00:00Z' },
  { id: 'bom-18', product_sku: 'C-001', packaging_code: 'FOIL-C1', qty_per_unit: 20, type: 'tea_bag', source: 'OEM', notes: '20 tea bags per unit', created_at: '2024-07-01T00:00:00Z', updated_at: '2024-07-01T00:00:00Z' },
  { id: 'bom-19', product_sku: 'C-002', packaging_code: 'BOX-C1', qty_per_unit: 1, type: 'main', source: 'OEM', notes: null, created_at: '2024-09-15T00:00:00Z', updated_at: '2024-09-15T00:00:00Z' },
  { id: 'bom-20', product_sku: 'C-003', packaging_code: 'BOX-C1', qty_per_unit: 1, type: 'main', source: 'OEM', notes: null, created_at: '2025-02-01T00:00:00Z', updated_at: '2025-02-01T00:00:00Z' },
  { id: 'bom-21', product_sku: 'C-003', packaging_code: 'FOIL-C1', qty_per_unit: 25, type: 'tea_bag', source: 'OEM', notes: '25 tea bags per unit', created_at: '2025-02-01T00:00:00Z', updated_at: '2025-02-01T00:00:00Z' },
  { id: 'bom-22', product_sku: 'C-004', packaging_code: 'BOX-C1', qty_per_unit: 1, type: 'main', source: 'OEM', notes: null, created_at: '2025-04-15T00:00:00Z', updated_at: '2025-04-15T00:00:00Z' },
]
