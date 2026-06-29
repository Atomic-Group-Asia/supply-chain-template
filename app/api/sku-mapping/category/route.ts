import { NextResponse } from 'next/server'
import { sheetTitleByGid, writeSheetCell, colIndexToLetter, readSheetByGid } from '@/lib/gsheet'
import { invalidateSkuMappingCache } from '@/lib/fg-inventory'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const STOCK_SS = '1n1h-Gjg55_xMu50F3S9G7K9O00Tp-y_ABnfbSY9GQWo'
const SKU_MAPPING_GID = 1256833182

/**
 * PATCH /api/sku-mapping/category
 * body: { sku: string, category: string }
 *
 * Writes the new category back to the SKU Mapping gsheet so other pages
 * (FG Inventory, Batches, Purchase Decisions) pick it up.
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const sku = (body?.sku || '').trim()
    const category = (body?.category || '').trim()
    if (!sku) return NextResponse.json({ error: 'sku is required' }, { status: 400 })

    const rows = await readSheetByGid(STOCK_SS, SKU_MAPPING_GID)
    if (rows.length === 0) {
      return NextResponse.json({ error: 'SKU Mapping sheet is empty' }, { status: 500 })
    }
    const header = (rows[0] || []).map(h => String(h || '').toLowerCase().trim())
    const skuCol = header.indexOf('sku')
    let catCol = header.indexOf('category')
    if (catCol < 0) catCol = header.indexOf('type')
    if (skuCol < 0) {
      return NextResponse.json({ error: 'Could not find SKU column' }, { status: 500 })
    }
    if (catCol < 0) {
      return NextResponse.json({
        error: 'Could not find Category/Type column in SKU Mapping sheet. Add a "Category" header to enable in-app editing.',
      }, { status: 400 })
    }

    // Find the row matching this SKU (case-insensitive, trimmed)
    let rowIdx = -1
    for (let i = 1; i < rows.length; i++) {
      const v = String(rows[i]?.[skuCol] || '').trim()
      if (v.toLowerCase() === sku.toLowerCase()) { rowIdx = i; break }
    }
    if (rowIdx < 0) {
      return NextResponse.json({ error: `SKU ${sku} not found in SKU Mapping` }, { status: 404 })
    }

    const sheetTitle = await sheetTitleByGid(STOCK_SS, SKU_MAPPING_GID)
    const cell = `${colIndexToLetter(catCol)}${rowIdx + 1}`
    const range = `'${sheetTitle.replace(/'/g, "''")}'!${cell}`
    await writeSheetCell(STOCK_SS, range, category)

    // Bust the 5-minute mapping cache so the new value shows up immediately
    invalidateSkuMappingCache()
    return NextResponse.json({ ok: true, sku, category, cell })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Update failed' }, { status: 500 })
  }
}
