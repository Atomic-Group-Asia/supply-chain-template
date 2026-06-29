import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import * as XLSX from 'xlsx'

const cleanInt = (v: any) => {
  if (v == null || v === '' || v === '-') return null
  const n = parseInt(String(v).replace(/[,+]/g, '').trim(), 10)
  return isNaN(n) ? null : n
}

const cleanText = (v: any) => {
  const t = String(v ?? '').trim()
  if (!t || t === '-') return null
  return t
}

const parseDate = (v: any): string | null => {
  if (!v) return null
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.substring(0, 10)
  if (v instanceof Date) return v.toISOString().substring(0, 10)
  if (typeof v === 'number') {
    const d = XLSX.SSF.parse_date_code(v)
    if (d) {
      const m = String(d.m).padStart(2, '0')
      const day = String(d.d).padStart(2, '0')
      return `${d.y}-${m}-${day}`
    }
  }
  return null
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const brandRaw = formData.get('brand')
    const brand = brandRaw ? String(brandRaw).trim() : null

    console.log('Upload received - brand:', brand, 'file:', file?.name)

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    if (!brand) return NextResponse.json({ error: 'Brand is required' }, { status: 400 })

    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheetName = wb.SheetNames[0]
    const sheet = wb.Sheets[sheetName]
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as any[][]

    if (rawRows.length < 2) return NextResponse.json({ error: 'Empty file' }, { status: 400 })

    const headers = rawRows[0].map((h: any) => String(h || '').trim().toUpperCase())
    const dataRows = rawRows.slice(1).filter(r => r && r.some(cell => cell != null))

    const colIdx = (name: string, occurrence = 0) => {
      let count = 0
      for (let i = 0; i < headers.length; i++) {
        if (headers[i] === name.toUpperCase()) {
          if (count === occurrence) return i
          count++
        }
      }
      return -1
    }

    const idx = {
      sku: colIdx('SKU'),
      upc: colIdx('UPC'),
      detail: colIdx('DETAIL'),
      date1: colIdx('DATE', 0),
      starting: colIdx('STARTING'),
      in: colIdx('IN'),
      out: colIdx('OUT'),
      closing: colIdx('CLOSING'),
      date2: colIdx('DATE', 1),
      change: colIdx('CHANGE'),
      warehouse: colIdx('WAREHOUSE'),
    }

    if (idx.sku < 0) return NextResponse.json({ error: 'SKU column not found' }, { status: 400 })

    const { randomUUID } = await import('crypto')
    const batchId = randomUUID()

    const movements = dataRows.map(r => ({
      brand,
      sku: cleanText(r[idx.sku]),
      upc: idx.upc >= 0 ? cleanText(r[idx.upc]) : null,
      detail: idx.detail >= 0 ? cleanText(r[idx.detail]) : null,
      date_start: idx.date1 >= 0 ? parseDate(r[idx.date1]) : null,
      starting: idx.starting >= 0 ? cleanInt(r[idx.starting]) : null,
      in_qty: idx.in >= 0 ? cleanInt(r[idx.in]) : null,
      out_qty: idx.out >= 0 ? cleanInt(r[idx.out]) : null,
      closing: idx.closing >= 0 ? cleanInt(r[idx.closing]) : null,
      date_end: idx.date2 >= 0 ? parseDate(r[idx.date2]) : null,
      change_qty: idx.change >= 0 ? cleanInt(r[idx.change]) : null,
      warehouse: idx.warehouse >= 0 ? cleanText(r[idx.warehouse]) : null,
      upload_batch: batchId,
    })).filter(m => m.sku)

    if (movements.length === 0) return NextResponse.json({ error: 'No valid rows' }, { status: 400 })

    // Delete existing rows for this brand + same date periods to avoid duplicates,
    // then insert fresh. This handles re-uploads without relying on NULL-aware upsert.
    const datesInUpload = [...new Set(movements.map(m => m.date_start).filter(Boolean))] as string[]

    if (datesInUpload.length > 0) {
      await supabaseAdmin
        .from('stock_movements')
        .delete()
        .eq('brand', brand)
        .in('date_start', datesInUpload)
    }

    const { error } = await supabaseAdmin.from('stock_movements').insert(movements)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({
      success: true,
      processed: movements.length,
      message: `${movements.length} ${brand} rows imported`,
      batchId,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}