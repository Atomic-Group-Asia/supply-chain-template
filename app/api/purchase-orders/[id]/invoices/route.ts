import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BUCKET = 'po-invoices'

// GET /api/purchase-orders/[id]/invoices
// List all invoices for a PO, with their linked line-item allocations.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('po_invoices')
    .select('*, items:po_invoice_items(*)')
    .eq('po_id', id)
    .order('invoice_date', { ascending: true, nullsFirst: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ invoices: data || [] })
}

// POST /api/purchase-orders/[id]/invoices
// multipart form: invoice_number, invoice_date, amount, notes, created_by,
//                 items (JSON array of {po_item_id, qty}), file (PDF)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: poId } = await params
    const form = await req.formData()
    const invoice_number = (form.get('invoice_number') as string | null)?.trim()
    const invoice_date = (form.get('invoice_date') as string | null) || null
    const amount = Number(form.get('amount') || 0)
    const notes = (form.get('notes') as string | null) || null
    const created_by = (form.get('created_by') as string | null) || null
    const itemsRaw = form.get('items') as string | null
    const file = form.get('file') as File | null

    if (!invoice_number) {
      return NextResponse.json({ error: 'invoice_number is required' }, { status: 400 })
    }
    if (amount <= 0) {
      return NextResponse.json({ error: 'amount must be > 0' }, { status: 400 })
    }

    let items: { po_item_id: string; qty: number }[] = []
    try {
      items = itemsRaw ? JSON.parse(itemsRaw) : []
    } catch {
      return NextResponse.json({ error: 'items must be valid JSON' }, { status: 400 })
    }
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Select at least one PO line for this invoice' }, { status: 400 })
    }

    // Upload PDF if provided
    let pdf_path: string | null = null
    let pdf_filename: string | null = null
    if (file && file.size > 0) {
      const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().slice(0, 6)
      const filename = `${crypto.randomUUID()}.${ext}`
      pdf_path = `${poId}/${filename}`
      pdf_filename = file.name
      const buf = Buffer.from(await file.arrayBuffer())
      const { error: upErr } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(pdf_path, buf, {
          contentType: file.type || 'application/pdf',
          upsert: false,
        })
      if (upErr) return NextResponse.json({ error: 'Upload failed: ' + upErr.message }, { status: 500 })
    }

    // Insert invoice header
    const { data: invoice, error: invErr } = await supabaseAdmin
      .from('po_invoices')
      .insert({
        po_id: poId,
        invoice_number,
        invoice_date,
        amount,
        pdf_path,
        pdf_filename,
        notes,
        created_by,
      })
      .select().single()
    if (invErr) {
      if (pdf_path) await supabaseAdmin.storage.from(BUCKET).remove([pdf_path])
      return NextResponse.json({ error: invErr.message }, { status: 400 })
    }

    // Insert line-item links
    const itemRows = items.map(it => ({
      invoice_id: invoice.id,
      po_item_id: it.po_item_id,
      qty: Number(it.qty) || 0,
    }))
    const { error: itemsErr } = await supabaseAdmin.from('po_invoice_items').insert(itemRows)
    if (itemsErr) {
      // Roll back invoice + pdf
      await supabaseAdmin.from('po_invoices').delete().eq('id', invoice.id)
      if (pdf_path) await supabaseAdmin.storage.from(BUCKET).remove([pdf_path])
      return NextResponse.json({ error: itemsErr.message }, { status: 400 })
    }

    return NextResponse.json({ invoice })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Create failed' }, { status: 500 })
  }
}
