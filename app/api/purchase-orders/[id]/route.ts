import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { applyConsumption, type LineDelta } from '@/lib/packaging-consumption'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { action, actor, reason, ...rest } = body

    if (action === 'approve') {
      if (actor !== 'Syuen') {
        return NextResponse.json({ error: 'Only Syuen can approve POs' }, { status: 403 })
      }
      const { data, error } = await supabaseAdmin
        .from('purchase_orders')
        .update({
          status: 'approved',
          approved_by: actor,
          approved_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'pending')
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json(data)
    }

    if (action === 'reject') {
      const { data, error } = await supabaseAdmin
        .from('purchase_orders')
        .update({
          status: 'rejected',
          rejected_by: actor || 'Unknown',
          rejected_at: new Date().toISOString(),
          rejection_reason: reason || null,
        })
        .eq('id', id)
        .eq('status', 'pending')
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json(data)
    }

    if (action === 'update') {
      const { data, error } = await supabaseAdmin
        .from('purchase_orders')
        .update(rest)
        .eq('id', id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json(data)
    }

    if (action === 'mark_received') {
      // body: { lines: [{ id, received_qty }], actor }
      // Per-line received_qty (cumulative). Header status recomputed:
      //   sum(received) = 0 → no change (caller shouldn't have hit this)
      //   0 < sum < sum(ordered) → status = 'partial_received'
      //   sum(received) >= sum(ordered) → status = 'received' + received_at + received_by
      const incoming = (rest as any).lines || []
      if (!Array.isArray(incoming) || incoming.length === 0) {
        return NextResponse.json({ error: 'lines[] required' }, { status: 400 })
      }

      // Capture old received_qty BEFORE update so we can compute deltas
      // for packaging consumption. Also need PO type — only FG POs consume
      // packaging (Pkg POs / Raw POs don't trigger consumption).
      const { data: poBefore } = await supabaseAdmin
        .from('purchase_orders').select('po_type').eq('id', id).single()
      const isFGPo = poBefore?.po_type === 'FG'

      const { data: oldItems } = await supabaseAdmin
        .from('purchase_order_items')
        .select('id, sku, received_qty')
        .eq('po_id', id)
      const oldMap = new Map<string, { sku: string | null; received: number }>()
      for (const it of oldItems || []) {
        oldMap.set(it.id, { sku: it.sku, received: Number(it.received_qty) || 0 })
      }

      // Persist each line's received_qty (absolute, not delta — caller sends final value)
      for (const ln of incoming) {
        if (!ln.id) continue
        const newQty = Math.max(0, Number(ln.received_qty) || 0)
        const { error: e } = await supabaseAdmin
          .from('purchase_order_items').update({ received_qty: newQty }).eq('id', ln.id).eq('po_id', id)
        if (e) return NextResponse.json({ error: e.message }, { status: 400 })
      }

      // Auto-deduct packaging via BOM if this is an FG PO. Failures here
      // don't block the receipt — we still want the FG marked received,
      // but we surface any errors in the response.
      let consumption: any = null
      if (isFGPo) {
        const deltas: LineDelta[] = incoming
          .filter((ln: any) => ln.id)
          .map((ln: any) => {
            const prev = oldMap.get(ln.id)
            return {
              line_id: ln.id,
              fg_sku: prev?.sku || null,
              old_received: prev?.received || 0,
              new_received: Math.max(0, Number(ln.received_qty) || 0),
            }
          })
        try {
          consumption = await applyConsumption({ poId: id, deltas, actor: actor || null })
        } catch (e: any) {
          consumption = { consumed: [], errors: [`Consumption: ${e?.message || e}`] }
        }
      }
      // Re-read header + lines to recompute status
      const { data: items, error: iErr } = await supabaseAdmin
        .from('purchase_order_items').select('qty, received_qty').eq('po_id', id)
      if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 })
      let totalOrdered = 0, totalReceived = 0
      for (const it of items || []) {
        totalOrdered += Number(it.qty || 0)
        totalReceived += Number(it.received_qty || 0)
      }
      const headerPatch: any = {}
      if (totalReceived <= 0) {
        // nothing — leave status alone
      } else if (totalReceived >= totalOrdered) {
        headerPatch.status = 'received'
        headerPatch.received_at = new Date().toISOString()
        if (actor) headerPatch.received_by = actor
      } else {
        headerPatch.status = 'partial_received'
        if (actor) headerPatch.received_by = actor
      }
      if (Object.keys(headerPatch).length > 0) {
        const { error: hErr } = await supabaseAdmin.from('purchase_orders').update(headerPatch).eq('id', id)
        if (hErr) return NextResponse.json({ error: hErr.message }, { status: 400 })
      }
      const { data: hdr } = await supabaseAdmin.from('purchase_orders').select('*, items:purchase_order_items(*)').eq('id', id).single()
      return NextResponse.json({ ...hdr, consumption })
    }

    if (action === 'revert_receipt') {
      // Undo a (received | partial_received) receipt:
      //  • Reset every line's received_qty to 0
      //  • Restore packaging.stock_balance by summing the
      //    packaging_movements that were written when the FG PO was received
      //  • Delete those packaging_movements (audit history removed — this
      //    is an explicit "I clicked the wrong button" undo)
      //  • Header status → approved; clear received_at / received_by
      const { data: po } = await supabaseAdmin
        .from('purchase_orders').select('status, po_type').eq('id', id).single()
      if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
      if (po.status !== 'received' && po.status !== 'partial_received') {
        return NextResponse.json({ error: `Cannot revert a ${po.status} PO` }, { status: 400 })
      }

      // 1. Roll back packaging consumption for FG POs
      if (po.po_type === 'FG') {
        const { data: movs } = await supabaseAdmin
          .from('packaging_movements')
          .select('packaging_code, qty_delta')
          .eq('source_po_id', id)
        const restoreByCode = new Map<string, number>()
        for (const m of movs || []) {
          // qty_delta is negative for consumption; subtract a negative = add back
          restoreByCode.set(m.packaging_code, (restoreByCode.get(m.packaging_code) || 0) - Number(m.qty_delta || 0))
        }
        for (const [code, addBack] of restoreByCode) {
          if (addBack === 0) continue
          const { data: pkg } = await supabaseAdmin
            .from('packaging').select('stock_balance').eq('packaging_code', code).single()
          if (!pkg) continue
          const newBal = (Number(pkg.stock_balance) || 0) + addBack
          await supabaseAdmin
            .from('packaging').update({ stock_balance: newBal }).eq('packaging_code', code)
        }
        // Drop the movement rows so the consumption tab doesn't show the
        // reverted entry as if it really happened.
        await supabaseAdmin.from('packaging_movements').delete().eq('source_po_id', id)
      }

      // 2. Reset each line's received_qty
      await supabaseAdmin
        .from('purchase_order_items').update({ received_qty: 0 }).eq('po_id', id)

      // 3. Header back to approved
      const { data: hdr, error: hErr } = await supabaseAdmin
        .from('purchase_orders')
        .update({ status: 'approved', received_at: null, received_by: null })
        .eq('id', id).select('*, items:purchase_order_items(*)').single()
      if (hErr) return NextResponse.json({ error: hErr.message }, { status: 400 })
      return NextResponse.json(hdr)
    }

    if (action === 'record_payment') {
      const { amount } = rest
      const paid = Number(amount || 0)
      if (paid <= 0) return NextResponse.json({ error: 'Amount must be > 0' }, { status: 400 })

      const { data: po } = await supabaseAdmin
        .from('purchase_orders')
        .select('total_amount, paid_amount')
        .eq('id', id)
        .single()
      if (!po) return NextResponse.json({ error: 'PO not found' }, { status: 404 })

      const newPaid = Number(po.paid_amount || 0) + paid
      const total = Number(po.total_amount || 0)
      let payment_status = 'unpaid'
      if (newPaid >= total) payment_status = 'paid'
      else if (newPaid > 0) payment_status = 'partial'

      const updates: any = {
        paid_amount: newPaid,
        // Always advance paid_at so we know "last payment date" — fully paid OR partial
        paid_at: new Date().toISOString(),
        payment_status,
      }
      if (actor) updates.paid_by = actor
      const { data, error } = await supabaseAdmin
        .from('purchase_orders')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json(data)
    }

    if (action === 'update_full') {
      // Full edit: update header fields + replace line items + recompute totals
      const { items, terms, expected_date, notes, supplier_code, supplier_name, po_number } = rest

      // Allow editing pending AND approved POs. Once stock has been
      // received (received / partial_received) we lock to preserve the
      // received_qty audit trail; rejected / cancelled stay locked too.
      const { data: existing } = await supabaseAdmin
        .from('purchase_orders').select('status').eq('id', id).single()
      if (!existing) return NextResponse.json({ error: 'PO not found' }, { status: 404 })
      const EDITABLE_STATUSES = new Set(['pending', 'approved'])
      if (!EDITABLE_STATUSES.has(existing.status)) {
        return NextResponse.json({
          error: `Cannot edit ${existing.status} PO. Only pending / approved POs can be edited.`,
        }, { status: 400 })
      }

      let total_qty = 0
      let total_amount = 0
      const itemsList = Array.isArray(items) ? items : []
      for (const it of itemsList) {
        total_qty += Number(it.qty || 0)
        total_amount += Number(it.qty || 0) * Number(it.unit_cost || 0)
      }

      // Update header
      const headerPatch: any = { total_qty, total_amount }
      if (terms !== undefined) headerPatch.terms = terms
      if (expected_date !== undefined) headerPatch.expected_date = expected_date
      if (notes !== undefined) headerPatch.notes = notes
      if (supplier_code !== undefined) headerPatch.supplier_code = supplier_code
      if (supplier_name !== undefined) headerPatch.supplier_name = supplier_name
      if (po_number !== undefined && po_number !== null) {
        const trimmed = String(po_number).trim()
        if (trimmed) headerPatch.po_number = trimmed
      }

      const { data: hdr, error: hErr } = await supabaseAdmin
        .from('purchase_orders')
        .update(headerPatch)
        .eq('id', id)
        .select()
        .single()
      if (hErr) return NextResponse.json({ error: hErr.message }, { status: 400 })

      // Replace all line items: delete + reinsert
      const { error: dErr } = await supabaseAdmin.from('purchase_order_items').delete().eq('po_id', id)
      if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 })

      if (itemsList.length > 0) {
        const insertRows = itemsList.map((it: any) => ({
          po_id: id,
          brand: it.brand,
          sku: it.sku,
          product_name: it.product_name,
          qty: Number(it.qty || 0),
          uom: it.uom || 'Unit',
          unit_cost: Number(it.unit_cost || 0),
          amount: Number(it.qty || 0) * Number(it.unit_cost || 0),
          reason: it.reason || null,
          notes: it.notes || null,
          expected_date: it.expected_date || null,
        }))
        const { error: iErr } = await supabaseAdmin.from('purchase_order_items').insert(insertRows)
        if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 })
      }

      return NextResponse.json(hdr)
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabaseAdmin.from('purchase_orders').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
