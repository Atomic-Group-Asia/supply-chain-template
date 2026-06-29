import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { brandCode, yymm } from '@/lib/entity-map'

async function nextSeq(entity_code: string, ym: string): Promise<number> {
  const { data: existing } = await supabaseAdmin
    .from('po_sequences')
    .select('last_seq')
    .eq('entity_code', entity_code)
    .eq('yymm', ym)
    .maybeSingle()
  const next = (existing?.last_seq || 0) + 1
  if (existing) {
    await supabaseAdmin.from('po_sequences').update({ last_seq: next }).eq('entity_code', entity_code).eq('yymm', ym)
  } else {
    await supabaseAdmin.from('po_sequences').insert({ entity_code, yymm: ym, last_seq: next })
  }
  return next
}

function buildPONumber(entity_code: string, brands: string[], ym: string, seq: number): { po_number: string; brand_label: string } {
  const seqStr = String(seq).padStart(3, '0')
  if (brands.length === 1) {
    const bc = brandCode(brands[0])
    if (entity_code === '1PCT') return { po_number: `${entity_code}-${bc}-${ym}-PO${seqStr}`, brand_label: bc }
    return { po_number: `${entity_code}-${ym}-PO${seqStr}`, brand_label: bc }
  }
  return { po_number: `${entity_code}-${ym}-PO${seqStr}`, brand_label: 'MIXED' }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const drafted_by = body.drafted_by || 'Jun Ye'

    const { data: src, error: srcErr } = await supabaseAdmin
      .from('purchase_orders')
      .select('*, items:purchase_order_items(*)')
      .eq('id', id)
      .single()
    if (srcErr || !src) return NextResponse.json({ error: srcErr?.message || 'Source PO not found' }, { status: 404 })

    const ym = yymm()
    const seq = await nextSeq(src.entity_code, ym)
    const { po_number, brand_label } = buildPONumber(src.entity_code, src.brands || [], ym, seq)

    const { data: copy, error: copyErr } = await supabaseAdmin
      .from('purchase_orders')
      .insert({
        po_number,
        entity_code: src.entity_code,
        entity_name: src.entity_name,
        po_type: src.po_type,
        brands: src.brands,
        brand_label,
        supplier_code: src.supplier_code,
        supplier_name: src.supplier_name,
        total_qty: src.total_qty,
        total_amount: src.total_amount,
        terms: src.terms,
        status: 'pending',
        drafted_by,
        expected_date: null,
        notes: src.notes ? `Copied from ${src.po_number}. ${src.notes}` : `Copied from ${src.po_number}`,
      })
      .select()
      .single()
    if (copyErr) return NextResponse.json({ error: copyErr.message }, { status: 400 })

    if ((src.items || []).length > 0) {
      const { error: iErr } = await supabaseAdmin.from('purchase_order_items').insert(
        src.items.map((it: any) => ({
          po_id: copy.id,
          brand: it.brand,
          sku: it.sku,
          product_name: it.product_name,
          qty: it.qty,
          uom: it.uom,
          unit_cost: it.unit_cost,
          amount: it.amount,
          reason: it.reason,
          notes: it.notes,
          expected_date: it.expected_date || null,
        }))
      )
      if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 })
    }

    return NextResponse.json({ id: copy.id, po_number })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
