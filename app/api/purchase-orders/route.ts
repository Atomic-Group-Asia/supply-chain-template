import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { brandCode, yymm } from '@/lib/entity-map'

type IncomingItem = {
  brand: string
  sku: string | null
  product_name: string
  qty: number
  uom: string
  unit_cost: number
  amount: number
  reason?: string | null
  notes?: string | null
  expected_date?: string | null   // per-line ETA; falls back to PO header if null
}

type IncomingPO = {
  entity_code: string
  entity_name: string
  po_type: 'FG' | 'Packaging'
  brands: string[]
  supplier_code: string | null
  supplier_name: string
  total_qty: number
  total_amount: number
  terms: string | null
  drafted_by: string
  expected_date: string | null
  notes: string | null
  items: IncomingItem[]
  // Optional override — if provided, used as-is and the entity sequence
  // is NOT advanced. Useful for keying in existing/external POs.
  po_number?: string | null
}

// Find the smallest unused sequence number for this entity+yymm by scanning
// ACTUAL existing POs. Deleted PO numbers are naturally reclaimed — no
// dependency on a separate counter table.
//
// Recognises both PO number formats so old-format POs still count:
//   New:  {entity}[-{brand}]-PO{yymm}-{seq}     e.g. NAT-PO2605-001
//   Old:  {entity}[-{brand}]-{yymm}-PO{seq}     e.g. NAT-2605-PO001
async function nextSeq(entity_code: string, ym: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('purchase_orders')
    .select('po_number')
    .eq('entity_code', entity_code)
    .or(`po_number.ilike.%PO${ym}-%,po_number.ilike.%${ym}-PO%`)

  const used = new Set<number>()
  // Capture the last 1-4 digit group at the end (e.g. "-001") or after "PO"
  const re = /(?:PO|-)(\d{1,4})$/i
  for (const row of data || []) {
    const m = re.exec(row.po_number || '')
    if (m) used.add(parseInt(m[1], 10))
  }

  // Smallest n >= 1 that isn't taken — reclaims any gap (e.g. deleted #5)
  let n = 1
  while (used.has(n)) n++
  return n
}

function buildPONumber(entity_code: string, brands: string[], ym: string, seq: number): { po_number: string; brand_label: string } {
  const seqStr = String(seq).padStart(3, '0')
  // New format (2026-05-19): {entity}[-{brand}]-PO{yymm}-{seq}
  //   NAT-PO2605-001 / HRT-PO2605-001
  //   1PCT-TPD-PO2605-001 (multi-brand entities keep brand in number)
  //   1PCT-PO2605-001 with brand_label='MIXED' for cross-brand POs
  if (brands.length === 1) {
    const bc = brandCode(brands[0])
    if (entity_code === '1PCT') {
      return { po_number: `${entity_code}-${bc}-PO${ym}-${seqStr}`, brand_label: bc }
    }
    return { po_number: `${entity_code}-PO${ym}-${seqStr}`, brand_label: bc }
  }
  // Mixed brands
  return { po_number: `${entity_code}-PO${ym}-${seqStr}`, brand_label: 'MIXED' }
}

export async function GET() {
  const { data: orders, error } = await supabaseAdmin
    .from('purchase_orders')
    .select('*, items:purchase_order_items(*)')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(orders)
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const pos: IncomingPO[] = body.pos
    if (!Array.isArray(pos) || pos.length === 0) {
      return NextResponse.json({ error: 'No POs to create' }, { status: 400 })
    }

    const ym = yymm()
    const created: any[] = []

    for (const p of pos) {
      let po_number: string
      let brand_label: string
      if (p.po_number && p.po_number.trim()) {
        // Manual override — don't advance the entity sequence
        po_number = p.po_number.trim()
        brand_label = p.brands.length === 1 ? p.brands[0] : 'MIXED'
      } else {
        const seq = await nextSeq(p.entity_code, ym)
        ;({ po_number, brand_label } = buildPONumber(p.entity_code, p.brands, ym, seq))
      }

      const { data: header, error: hErr } = await supabaseAdmin
        .from('purchase_orders')
        .insert({
          po_number,
          entity_code: p.entity_code,
          entity_name: p.entity_name,
          po_type: p.po_type,
          brands: p.brands,
          brand_label,
          supplier_code: p.supplier_code,
          supplier_name: p.supplier_name,
          total_qty: p.total_qty,
          total_amount: p.total_amount,
          terms: p.terms,
          status: 'pending',
          drafted_by: p.drafted_by,
          expected_date: p.expected_date,
          notes: p.notes,
        })
        .select()
        .single()
      if (hErr) return NextResponse.json({ error: hErr.message }, { status: 400 })

      if (p.items.length > 0) {
        const { error: iErr } = await supabaseAdmin.from('purchase_order_items').insert(
          p.items.map(it => ({
            po_id: header.id,
            brand: it.brand,
            sku: it.sku,
            product_name: it.product_name,
            qty: it.qty,
            uom: it.uom,
            unit_cost: it.unit_cost,
            amount: it.amount,
            reason: it.reason || null,
            notes: it.notes || null,
            expected_date: it.expected_date || null,
          }))
        )
        if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 })
      }

      created.push(header)
    }

    return NextResponse.json({ created })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
