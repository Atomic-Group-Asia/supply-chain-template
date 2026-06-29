import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const BUCKET = 'po-invoices'

// GET /api/po-invoices/[id]  — returns invoice + signed PDF url
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('po_invoices')
    .select('*, items:po_invoice_items(*)')
    .eq('id', id).single()
  if (error || !data) return NextResponse.json({ error: error?.message || 'Not found' }, { status: 404 })
  let pdf_signed_url: string | null = null
  if (data.pdf_path) {
    const { data: signed } = await supabaseAdmin.storage
      .from(BUCKET).createSignedUrl(data.pdf_path, 60 * 30) // 30 min
    pdf_signed_url = signed?.signedUrl || null
  }
  return NextResponse.json({ invoice: data, pdf_signed_url })
}

// DELETE /api/po-invoices/[id]  — hard delete + PDF storage cleanup
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: existing } = await supabaseAdmin
    .from('po_invoices').select('pdf_path').eq('id', id).single()
  const { error } = await supabaseAdmin.from('po_invoices').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  if (existing?.pdf_path) {
    await supabaseAdmin.storage.from(BUCKET).remove([existing.pdf_path])
  }
  return NextResponse.json({ ok: true })
}

// PATCH /api/po-invoices/[id]
//   body: { action: 'record_payment', amount, actor } — record payment against this invoice
//   body: { action: 'update', ...patch }              — edit invoice header fields
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { action } = body

    if (action === 'record_payment') {
      const amount = Number(body.amount || 0)
      if (amount <= 0) return NextResponse.json({ error: 'amount must be > 0' }, { status: 400 })

      const { data: inv } = await supabaseAdmin
        .from('po_invoices').select('*').eq('id', id).single()
      if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

      const newPaid = Number(inv.paid_amount || 0) + amount
      const total = Number(inv.amount || 0)
      let paid_status: 'unpaid' | 'partial' | 'paid' = 'unpaid'
      if (newPaid >= total) paid_status = 'paid'
      else if (newPaid > 0) paid_status = 'partial'

      const { data: updated, error } = await supabaseAdmin
        .from('po_invoices')
        .update({
          paid_amount: newPaid,
          paid_status,
          paid_at: new Date().toISOString(),
          paid_by: body.actor || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })

      // Roll up to PO payment_status
      await rollupPoPaymentStatus(inv.po_id)
      return NextResponse.json({ invoice: updated })
    }

    if (action === 'update') {
      const patch: any = {}
      const fields = ['invoice_number', 'invoice_date', 'amount', 'notes']
      for (const f of fields) if (f in body) patch[f] = body[f]
      patch.updated_at = new Date().toISOString()
      const { data: updated, error } = await supabaseAdmin
        .from('po_invoices').update(patch).eq('id', id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      await rollupPoPaymentStatus(updated.po_id)
      return NextResponse.json({ invoice: updated })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Update failed' }, { status: 500 })
  }
}

/**
 * Recompute purchase_orders.payment_status + paid_amount from the sum of
 * all invoices on that PO.
 */
async function rollupPoPaymentStatus(poId: string) {
  const { data: invoices } = await supabaseAdmin
    .from('po_invoices')
    .select('amount, paid_amount').eq('po_id', poId)
  if (!invoices) return
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.amount || 0), 0)
  const totalPaid = invoices.reduce((s, i) => s + Number(i.paid_amount || 0), 0)
  let payment_status: 'unpaid' | 'partial' | 'paid' = 'unpaid'
  if (totalInvoiced > 0 && totalPaid >= totalInvoiced) payment_status = 'paid'
  else if (totalPaid > 0) payment_status = 'partial'
  await supabaseAdmin
    .from('purchase_orders')
    .update({
      paid_amount: totalPaid,
      payment_status,
      paid_at: totalPaid > 0 ? new Date().toISOString() : null,
    })
    .eq('id', poId)
}
