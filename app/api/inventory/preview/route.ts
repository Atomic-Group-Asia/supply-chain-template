import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { readSkuMapping } from '@/lib/fg-inventory'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST /api/inventory/preview
 *   multipart form: file=<xlsx|csv>, brand=<brand>
 *
 * Parses the file, reads the LATEST currently-stored qty per SKU from
 * daily_stock_current, and returns a per-SKU diff:
 *   - current_qty (what we have stored)
 *   - new_qty     (what the file says)
 *   - delta
 *
 * Apply just upserts the new_qty into daily_stock_current. Batches are
 * NOT touched here — that ledger is managed manually on /batches.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file') as File | null
    const brand = (form.get('brand') as string | null)?.trim()
    if (!file || !brand) {
      return NextResponse.json({ error: 'file and brand are required' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(buf, { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false }) as any
    if (raw.length === 0) {
      return NextResponse.json({ error: 'Sheet is empty' }, { status: 400 })
    }

    // Brand-specific header preferences:
    //   - Heartio SG: SellingQuantity (NOT BufferStock / Quantity)
    //   - Nattome SG: 'Available quantity'
    //   - Others (HJT / Nattome MY / Heartio MY / TPD / HooHoo / Stonecare):
    //     Lazada/Shopee-style 'Available' or marketplace 'Available quantity'
    const SKU_NAMES = [
      'inventorysku', 'inventory sku',
      'commodity code',
      'sku', 'item code', 'product code',
      'seller sku', 'merchant sku',
    ]
    // Order matters — earlier entries win exact-match search.
    const CLOSING_NAMES = [
      'sellingquantity', 'selling quantity',
      'available quantity', 'available qty', 'available',
      'closing balance', 'closing stock', 'closing',
      'on hand', 'in stock',
      'quantity', 'qty', 'stock', 'balance',
    ]

    let headerRow = -1, skuIdx = -1, closingIdx = -1
    for (let r = 0; r < Math.min(5, raw.length); r++) {
      const row = (raw[r] || []).map(v => String(v ?? '').toLowerCase().trim())
      const sIdx = findIndex(row, SKU_NAMES)
      const cIdx = findIndex(row, CLOSING_NAMES)
      if (sIdx >= 0 && cIdx >= 0) {
        headerRow = r; skuIdx = sIdx; closingIdx = cIdx; break
      }
    }
    if (headerRow < 0) {
      const sample = (raw[0] || []).slice(0, 20).map(v => String(v)).join(', ')
      return NextResponse.json({
        error: `Could not find SKU + qty columns. Sample row-0 headers: ${sample}`,
      }, { status: 400 })
    }

    const headerNames = raw[headerRow] as string[]
    const skuCol = headerNames[skuIdx]
    const closingCol = headerNames[closingIdx]

    const uploadMap = new Map<string, number>()
    for (let r = headerRow + 1; r < raw.length; r++) {
      const row = raw[r] || []
      const sku = String(row[skuIdx] || '').trim()
      if (!sku) continue
      const qty = parseQty(row[closingIdx])
      if (qty == null) continue
      uploadMap.set(sku, qty)
    }
    if (uploadMap.size === 0) {
      return NextResponse.json({ error: 'No valid SKU rows found' }, { status: 400 })
    }

    // Validate SKUs against SKU Mapping (broader than products table)
    const mapping = await readSkuMapping()
    const productBySku = new Map(
      mapping
        .filter(m => m.brand === brand)
        .map(m => [m.sku, { sku: m.sku, product_name: m.product_name, brand: m.brand }])
    )

    // Current qty per SKU from daily_stock_current (= "Opening")
    const { data: currentRows } = await supabaseAdmin
      .from('daily_stock_current')
      .select('sku, qty').eq('brand', brand)
    const currentBySku = new Map<string, number>()
    for (const r of (currentRows || [])) currentBySku.set(r.sku, Number(r.qty) || 0)

    // Active batches per SKU for FEFO planning. Order by earliest expiry
    // first (nulls last) so the first-out is at the front.
    const { data: batchRows } = await supabaseAdmin
      .from('batches').select('id, sku, batch_number, expiry_date, qty_remaining, status')
      .eq('brand', brand).eq('status', 'active')
      .order('expiry_date', { ascending: true, nullsFirst: false })
    const batchesBySku = new Map<string, any[]>()
    for (const b of (batchRows || [])) {
      const list = batchesBySku.get(b.sku) || []
      list.push(b)
      batchesBySku.set(b.sku, list)
    }

    const diffs: any[] = []
    const unknownSkus: string[] = []
    for (const [sku, newQty] of uploadMap) {
      const product = productBySku.get(sku)
      if (!product) { unknownSkus.push(sku); continue }
      const currentQty = currentBySku.get(sku) || 0
      const delta = newQty - currentQty
      const entry: any = {
        sku,
        product_name: product.product_name || sku,
        current_qty: currentQty,
        new_qty: newQty,
        delta,
        change: delta === 0 ? 'no_change' : delta < 0 ? 'outflow' : 'inflow',
        fefo_plan: null as any,
        short_by: 0,
      }
      // Plan FEFO deduction for outflows so the user can see which
      // batches will be hit before Apply.
      if (delta < 0) {
        const need = -delta
        let remaining = need
        const skuBatches = batchesBySku.get(sku) || []
        const plan: any[] = []
        for (const b of skuBatches) {
          if (remaining <= 0) break
          const avail = Number(b.qty_remaining) || 0
          if (avail <= 0) continue
          const take = Math.min(avail, remaining)
          plan.push({
            batch_id: b.id,
            batch_number: b.batch_number,
            expiry_date: b.expiry_date,
            deduct: take,
            new_remaining: avail - take,
          })
          remaining -= take
        }
        entry.fefo_plan = plan
        if (remaining > 0) entry.short_by = remaining
      }
      diffs.push(entry)
    }

    return NextResponse.json({
      brand,
      headers_detected: { sku: skuCol, closing: closingCol },
      total_skus: diffs.length,
      unknown_skus: unknownSkus,
      diffs,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Preview failed' }, { status: 500 })
  }
}

function findIndex(rowLower: string[], names: string[]): number {
  for (const n of names) {
    const idx = rowLower.indexOf(n.toLowerCase())
    if (idx >= 0) return idx
  }
  for (const n of names) {
    const idx = rowLower.findIndex(h => h && h.includes(n.toLowerCase()))
    if (idx >= 0) return idx
  }
  return -1
}

function parseQty(v: any): number | null {
  if (v == null || v === '') return null
  const t = String(v).replace(/[,\s]/g, '')
  if (!t || t === '-') return null
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}
