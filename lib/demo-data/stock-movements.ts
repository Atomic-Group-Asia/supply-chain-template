// Demo stock movements — monthly summaries for 3 representative SKUs across 12 months.
// Enough history to populate L3M / L6M velocity charts and Avg/mo calcs.

const MONTHS_2025_2026: { start: string; end: string }[] = [
  { start: '2025-07-01', end: '2025-07-31' },
  { start: '2025-08-01', end: '2025-08-31' },
  { start: '2025-09-01', end: '2025-09-30' },
  { start: '2025-10-01', end: '2025-10-31' },
  { start: '2025-11-01', end: '2025-11-30' },
  { start: '2025-12-01', end: '2025-12-31' },
  { start: '2026-01-01', end: '2026-01-31' },
  { start: '2026-02-01', end: '2026-02-28' },
  { start: '2026-03-01', end: '2026-03-31' },
  { start: '2026-04-01', end: '2026-04-30' },
  { start: '2026-05-01', end: '2026-05-31' },
  { start: '2026-06-01', end: '2026-06-30' },
]

function mkRows(
  brand: string, sku: string,
  startingQty: number,
  pattern: { in: number; out: number }[],
) {
  let running = startingQty
  return MONTHS_2025_2026.map((m, i) => {
    const inQty = pattern[i].in
    const outQty = pattern[i].out
    const starting = running
    const closing = starting + inQty - outQty
    running = closing
    return {
      id: `sm-${brand.replace(' ', '')}-${sku}-${m.start}`,
      brand, sku, upc: null, detail: null,
      date_start: m.start, date_end: m.end,
      starting, in_qty: inQty, out_qty: outQty,
      closing, change_qty: inQty - outQty,
      warehouse: 'HQ',
      upload_batch: 'demo-seed-v1', uploaded_at: '2026-06-25T03:00:00Z',
      created_at: m.start + 'T00:00:00Z',
    }
  })
}

// Brand A · A-001 — strong, growing demand
const A001 = mkRows('Brand A', 'A-001', 5000, [
  { in: 0,    out: 1800 }, { in: 2000, out: 2100 },
  { in: 0,    out: 1900 }, { in: 3000, out: 2300 },
  { in: 0,    out: 2200 }, { in: 2400, out: 2400 },
  { in: 0,    out: 2500 }, { in: 3000, out: 2600 },
  { in: 0,    out: 2700 }, { in: 2400, out: 2800 },
  { in: 0,    out: 2900 }, { in: 3000, out: 1300 },  // current month partial
])

// Brand B · B-001 — declining, low stock (demo critical alert)
const B001 = mkRows('Brand B', 'B-001', 1200, [
  { in: 0,   out: 320 }, { in: 500, out: 380 },
  { in: 0,   out: 350 }, { in: 0,   out: 330 },
  { in: 400, out: 310 }, { in: 0,   out: 290 },
  { in: 0,   out: 270 }, { in: 0,   out: 280 },
  { in: 0,   out: 260 }, { in: 0,   out: 250 },
  { in: 0,   out: 240 }, { in: 0,   out: 110 },
])

// Brand C · C-001 — steady, with expiring batch
const C001 = mkRows('Brand C', 'C-001', 3000, [
  { in: 0,    out: 850 }, { in: 1000, out: 920 },
  { in: 0,    out: 880 }, { in: 1500, out: 900 },
  { in: 0,    out: 940 }, { in: 0,    out: 960 },
  { in: 1200, out: 980 }, { in: 0,    out: 950 },
  { in: 0,    out: 1010 }, { in: 0,    out: 1040 },
  { in: 1500, out: 1100 }, { in: 0,    out: 480 },
])

export const demoStockMovements = [...A001, ...B001, ...C001]
