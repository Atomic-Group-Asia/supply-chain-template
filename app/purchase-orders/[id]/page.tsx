import { supabaseAdmin } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PODetailActions } from '@/components/PODetailActions'
import { POInvoicesSection } from '@/components/POInvoicesSection'
import { POEditForm } from '@/components/POEditForm'
import { readFGStockByBrandSku, readFGIncomingByBrandSku } from '@/lib/fg-inventory'
import { fmtDateTime } from '@/lib/format'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const fmtN = (n: any) => n == null ? '—' : Number(n).toLocaleString()
const fmtRM = (n: any) => n == null ? '—' : `RM ${Number(n).toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`

const statusColor: Record<string, string> = {
  pending: 'bg-[#F5EDD6] text-[#8B6F1B]',
  approved: 'bg-[#E8EFE5] text-[#4A6B3D]',
  rejected: 'bg-[#F5DEDA] text-[#A53025]',
  received: 'bg-[#DDE7F0] text-[#2C5282]',
  cancelled: 'bg-[#EDEAE2] text-[#6B6B6B]',
}

export default async function PODetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ edit?: string }>
}) {
  const { id } = await params
  const { edit } = await searchParams

  const { data: po } = await supabaseAdmin
    .from('purchase_orders')
    .select('*, items:purchase_order_items(*)')
    .eq('id', id)
    .single()

  if (!po) return notFound()

  // Invoices (with line-item allocations) tied to this PO
  const { data: invoices } = await supabaseAdmin
    .from('po_invoices')
    .select('*, items:po_invoice_items(*)')
    .eq('po_id', id)
    .order('invoice_date', { ascending: true, nullsFirst: false })

  const items = (po.items || []).sort((a: any, b: any) => a.created_at.localeCompare(b.created_at))
  po.items = items

  // Allow edit for pending AND approved POs. Received / paid / cancelled
  // / rejected stay locked so audit trail and finance aren't disturbed.
  const editMode = edit === '1' && (po.status === 'pending' || po.status === 'approved')

  // ============ LIVE STOCK CONTEXT per line item ============
  // For FG POs: stock_months / available / safety (from products + L3M).
  // For Packaging POs: stock balance / incoming / committed (from packaging).
  // Shown as a sub-line under the product/code so reviewers can sanity-check qty.
  const stockContextBySku: Record<string, {
    stockMonths: number; available: number; safety: number; l3m: number;
  }> = {}
  const packagingContextBySku: Record<string, {
    stockBalance: number; incoming: number; committed: number; available: number; uom: string;
  }> = {}
  if (po.po_type === 'FG') {
    const skus = items.map((it: any) => it.sku).filter(Boolean)
    if (skus.length > 0) {
      const [{ data: skuProducts }, { data: movements }, stockMap, incomingMap] = await Promise.all([
        supabaseAdmin.from('products').select('sku, brand, safety_stock_qty').in('sku', skus),
        supabaseAdmin
          .from('stock_movements')
          .select('brand, sku, date_start, out_qty')
          .in('sku', skus)
          .gte('date_start', new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)),
        readFGStockByBrandSku(),
        // Exclude THIS PO from the incoming sum — otherwise an approved PO
        // counts its own qty as "incoming", inflating the available figure
        // shown next to each line item.
        readFGIncomingByBrandSku(po.id),
      ])
      // Sum monthly OUT qty per SKU, then average over last 3 months
      function monthKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
      const monthly = new Map<string, Map<string, number>>()
      for (const m of movements || []) {
        if (!m.sku || !m.date_start || !m.out_qty) continue
        const d = new Date(m.date_start); if (isNaN(d.getTime())) continue
        const mk = monthKey(d)
        if (!monthly.has(m.sku)) monthly.set(m.sku, new Map())
        monthly.get(m.sku)!.set(mk, (monthly.get(m.sku)!.get(mk) || 0) + Number(m.out_qty || 0))
      }
      const today = new Date()
      function l3m(sku: string): number {
        const inner = monthly.get(sku); if (!inner) return 0
        let s = 0
        for (let i = 0; i < 3; i++) {
          const d = new Date(today.getFullYear(), today.getMonth() - i - 1, 1)
          s += inner.get(monthKey(d)) || 0
        }
        return s / 3
      }
      for (const p of skuProducts || []) {
        const key = `${p.brand}::${p.sku}`
        const closing = stockMap.get(key) || 0
        const incoming = incomingMap.get(key) || 0
        // Stock Commitments are audit-only — WMS already reflects reservation
        // in the closing balance, so we don't subtract committed here.
        const available = closing + incoming
        const basis = l3m(p.sku)
        const stockMonths = basis > 0 ? available / basis : 999
        stockContextBySku[p.sku] = {
          stockMonths: Number(stockMonths.toFixed(2)),
          available,
          safety: Number(p.safety_stock_qty) || 0,
          l3m: Math.round(basis),
        }
      }
    }
  } else if (po.po_type === 'Packaging') {
    // Packaging: pull current stock_balance from master + sum live incoming
    // (open Packaging POs) + sum live committed (open FG POs × BOM qty).
    // ALL three are normalised to the packaging master's inner UOM so
    // Stock + Incoming − Committed actually tallies.
    const codes = items.map((it: any) => it.sku).filter(Boolean)
    if (codes.length > 0) {
      const [{ data: pkgRows }, { data: openPkgPos }, { data: pkgCommitments }, { data: bomRows }] = await Promise.all([
        supabaseAdmin.from('packaging').select('packaging_code, stock_balance, uom, pack_size').in('packaging_code', codes),
        // Exclude THIS PO from the incoming sum — its own qty shouldn't count
        // as "incoming" when shown on its own detail page. Include partial_received
        // — the undelivered remainder still counts.
        supabaseAdmin
          .from('purchase_orders')
          .select('id, status, items:purchase_order_items(sku, qty, uom, received_qty)')
          .eq('po_type', 'Packaging')
          .in('status', ['pending', 'approved', 'partial_received'])
          .neq('id', po.id),
        // Committed = ONLY what's explicitly in stock_commitments. We do NOT
        // infer demand from FG POs — that's a separate concept and showing it
        // as "committed" was misleading (the user has no manual commitments).
        supabaseAdmin
          .from('stock_commitments')
          .select('sku, qty, status')
          .eq('status', 'active')
          .in('sku', codes),
        // BOM still loaded — only for the "Component for X" line under the SKU.
        supabaseAdmin.from('bom').select('product_sku, packaging_code, qty_per_unit').in('packaging_code', codes),
      ])

      const fgUsersByCode: Record<string, Set<string>> = {}
      const bomQtyByPkg: Record<string, number[]> = {}
      for (const b of bomRows || []) {
        if (!b.product_sku || !b.packaging_code) continue
        ;(fgUsersByCode[b.packaging_code] = fgUsersByCode[b.packaging_code] || new Set()).add(b.product_sku)
        ;(bomQtyByPkg[b.packaging_code] = bomQtyByPkg[b.packaging_code] || []).push(Number(b.qty_per_unit) || 0)
      }
      function pcsPerUomFromBom(code: string): number {
        const arr = bomQtyByPkg[code] || []
        if (arr.length === 0) return 1
        const counts: Record<string, number> = {}
        for (const q of arr) counts[String(q)] = (counts[String(q)] || 0) + 1
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
        return top ? Number(top[0]) : arr[0]
      }

      // Committed lookup from stock_commitments table (real data, not inferred)
      const committedByCode: Record<string, number> = {}
      for (const c of pkgCommitments || []) {
        if (!c.sku) continue
        committedByCode[c.sku] = (committedByCode[c.sku] || 0) + Number(c.qty || 0)
      }

      for (const p of pkgRows || []) {
        const code = p.packaging_code
        const innerUom = p.uom || 'pc'
        const isInnerPc = /^pcs?$/i.test(innerUom)
        const packSize = Number(p.pack_size) || 1
        const pcsPerUom = isInnerPc ? 1 : pcsPerUomFromBom(code)

        // Incoming — sum open Packaging-PO lines, normalised to inner UOM
        let incoming = 0
        for (const ppo of openPkgPos || []) {
          for (const it of (ppo as any).items || []) {
            if (it.sku !== code) continue
            // For partial_received POs, only the undelivered portion counts as incoming
            const lineQty = Math.max(0, Number(it.qty || 0) - Number(it.received_qty || 0))
            if (lineQty <= 0) continue
            const lineUom = (it.uom || '').toLowerCase()
            const isOuter = /roll|pack|box|carton/.test(lineUom)
            const isPc = /^pcs?$/.test(lineUom)
            let inInner: number
            if (isOuter && packSize > 1) inInner = lineQty * packSize
            else if (isPc && pcsPerUom > 1) inInner = lineQty / pcsPerUom
            else inInner = lineQty
            incoming += inInner
          }
        }

        const committed = committedByCode[code] || 0 // real, from stock_commitments
        const stockBalance = Number(p.stock_balance) || 0
        packagingContextBySku[code] = {
          stockBalance,
          incoming,
          committed,
          available: stockBalance + incoming - committed,
          uom: innerUom,
        }
      }

      // Stash FG-component list per code (used for the "Component for X" line)
      ;(packagingContextBySku as any)._fgUsers = Object.fromEntries(
        Object.entries(fgUsersByCode).map(([code, set]) => [code, Array.from(set)])
      )
    }
  }

  let suppliers: any[] = []
  let productCatalog: any[] = []
  let packagingCatalog: any[] = []
  if (editMode) {
    const [supRes, prodRes, pkgRes] = await Promise.all([
      // Billing suppliers only — exclude OEM (they make, billing supplier invoices)
      supabaseAdmin.from('suppliers').select('supplier_code, supplier_name, supplier_type').neq('supplier_type', 'OEM').order('supplier_name'),
      supabaseAdmin.from('products').select('sku, brand, product_name, unit_cost').order('brand').order('sku'),
      supabaseAdmin.from('packaging').select('packaging_code, packaging_name, packaging_type, unit_cost, uom').order('packaging_code'),
    ])
    suppliers = supRes.data || []
    const { VISIBLE_BRANDS } = await import('@/lib/visible-brands')
    productCatalog = (prodRes.data || [])
      .filter((p: any) => VISIBLE_BRANDS.has(p.brand))
      .map((p: any) => ({
        sku: p.sku,
        brand: p.brand,
        product_name: p.product_name || p.sku,
        unit_cost: p.unit_cost,
        uom: 'pc',
      }))
    function pkgBrand(p: any): string {
      const t = (p.packaging_type || '').trim()
      if (VISIBLE_BRANDS.has(t)) return t
      const code = (p.packaging_code || '') as string
      if (code.startsWith('N-')) return 'Nattome'
      if (code.startsWith('HH')) return 'HooHoo'
      if (code.startsWith('KH') || code.startsWith('KG') || code.startsWith('TP') || code.startsWith('NR')) return 'Heartio'
      return t || 'Other'
    }
    packagingCatalog = (pkgRes.data || [])
      .map((p: any) => ({
        sku: p.packaging_code,
        brand: pkgBrand(p),
        product_name: p.packaging_name || p.packaging_code,
        unit_cost: p.unit_cost,
        uom: p.uom || 'pc',
      }))
      .filter((p: any) => VISIBLE_BRANDS.has(p.brand))
  }

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <Link href="/purchase-orders" className="hover:text-[#1A1A1A]">Purchase Orders</Link> · <strong className="text-[#1A1A1A]">{po.po_number}</strong>
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">
              {po.po_number} · {po.entity_code} · {po.po_type}
            </div>
            <h1 className="text-3xl font-medium tracking-tight">
              <span className="sensitive">{po.supplier_name}</span>
              <span className={`ml-3 inline-block px-2.5 py-1 rounded text-[11px] font-mono uppercase tracking-wider align-middle ${statusColor[po.status] || ''}`}>
                {po.status}
              </span>
            </h1>
            <div className="text-sm text-[#6B6B6B] mt-1">
              Drafted by {po.drafted_by} on {fmtDateTime(po.drafted_at)}
              {po.approved_by && <> · Approved by {po.approved_by}{po.approved_at && <> on {fmtDateTime(po.approved_at)}</>}</>}
              {po.rejected_by && <> · Rejected by {po.rejected_by}{po.rejected_at && <> on {fmtDateTime(po.rejected_at)}</>}</>}
              {po.received_by && <> · Received by {po.received_by}{po.received_at && <> on {fmtDateTime(po.received_at)}</>}</>}
              {po.paid_by && po.paid_at && <> · Last payment by {po.paid_by} on {fmtDateTime(po.paid_at)}</>}
            </div>
          </div>
          {!editMode && <PODetailActions po={po} />}
        </div>

        {editMode && (
          <POEditForm
            po={po}
            suppliers={suppliers}
            products={productCatalog}
            packaging={packagingCatalog}
          />
        )}

        {!editMode && <>

        {/* Top meta grid */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <MetaCard label="Entity" value={po.entity_name || po.entity_code} />
          <MetaCard label="Supplier" value={po.supplier_name} sensitive />
          <MetaCard label="Brands" value={(po.brands || []).join(' + ')} />
          <MetaCard label="Type" value={po.po_type} />
          <MetaCard label="Terms" value={po.terms || '—'} />
          <MetaCard label="Expected Date" value={po.expected_date || '—'} />
          <MetaCard label="Total Qty" value={Number(po.total_qty).toLocaleString()} />
          <MetaCard label="Total Amount" value={fmtRM(po.total_amount)} highlight sensitive />
        </div>

        {/* Notes */}
        {po.notes && (
          <div className="mb-6 p-3.5 border border-[#D4D0C7] bg-[#FAFAF7] rounded text-[12px] text-[#3D3D3D]">
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1">Notes</div>
            {po.notes}
          </div>
        )}

        {po.rejection_reason && (
          <div className="mb-6 p-3.5 border border-[#A53025] bg-[#F5DEDA] rounded text-[12px] text-[#A53025]">
            <div className="font-mono text-[10px] uppercase tracking-wider mb-1">Rejection Reason</div>
            {po.rejection_reason}
          </div>
        )}

        {/* Line items */}
        <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
          <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
            <div className="font-medium text-[15px]">Line Items ({items.length})</div>
          </div>
          <table className="w-full text-[13px]">
            <thead className="bg-white border-b border-[#E8E5DE]">
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
                <th className="px-5 py-2.5 w-12">No.</th>
                <th className="px-5 py-2.5">Brand</th>
                <th className="px-5 py-2.5">SKU / Code</th>
                <th className="px-5 py-2.5">Description</th>
                <th className="px-5 py-2.5 text-right">Qty</th>
                <th className="px-5 py-2.5">UOM</th>
                <th className="px-5 py-2.5 text-right">Unit Cost</th>
                <th className="px-5 py-2.5 text-right">Amount</th>
                <th className="px-5 py-2.5" title="Per-line ETA (falls back to PO header if blank)">ETA</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it: any, idx: number) => {
                const ctx = it.sku ? stockContextBySku[it.sku] : undefined
                const pkgCtx = it.sku ? packagingContextBySku[it.sku] : undefined
                const lowAvail = ctx && ctx.safety > 0 && ctx.available < ctx.safety
                const lowMonths = ctx && ctx.stockMonths < 2.5 && ctx.stockMonths < 999
                const pkgLow = pkgCtx && pkgCtx.available < 0
                // Auto-derived list of FG SKUs that consume this packaging
                const fgUsers: string[] = it.sku ? ((packagingContextBySku as any)._fgUsers?.[it.sku] || []) : []
                const formatNum = (n: number) => n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
                return (
                  <tr key={it.id} className="border-t border-[#F0EDE4]">
                    <td className="px-5 py-3 text-[#6B6B6B] font-mono">{idx + 1}</td>
                    <td className="px-5 py-3">{it.brand}</td>
                    <td className="px-5 py-3 font-mono text-[12px]">
                      {it.sku
                        ? <Link href={`/${po.po_type === 'Packaging' ? 'packaging' : 'products'}/${encodeURIComponent(it.sku)}`} className="text-[#C8432C] hover:underline">{it.sku}</Link>
                        : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <div>{it.product_name}</div>
                      {ctx && (
                        <div className={`text-[10px] mt-0.5 ${lowMonths ? 'text-[#C8432C]' : 'text-[#6B6B6B]'}`}>
                          Stock-mo {ctx.stockMonths >= 999 ? '∞' : ctx.stockMonths.toFixed(2)} ·{' '}
                          available <span className={lowAvail ? 'text-[#C8432C] font-semibold' : ''}>{ctx.available.toLocaleString()}</span>{' '}
                          · safety {ctx.safety.toLocaleString()}
                        </div>
                      )}
                      {pkgCtx && (
                        <div className={`text-[10px] mt-0.5 ${pkgLow ? 'text-[#C8432C]' : 'text-[#6B6B6B]'}`}>
                          Stock {formatNum(pkgCtx.stockBalance)} {pkgCtx.uom}
                          {pkgCtx.incoming > 0 && <> · incoming <span className="text-[#4A6B3D]">+{formatNum(pkgCtx.incoming)}</span></>}
                          {pkgCtx.committed > 0 && <> · committed <span className="text-[#A53025]">−{formatNum(pkgCtx.committed)}</span></>}
                          {' '}· available <span className={pkgLow ? 'text-[#C8432C] font-semibold' : ''}>{formatNum(pkgCtx.available)}</span>
                        </div>
                      )}
                      {pkgCtx && fgUsers.length > 0 && (
                        <div className="text-[10px] text-[#6B6B6B] italic mt-0.5">
                          Component for {fgUsers.join(', ')}
                        </div>
                      )}
                      {it.notes && <div className="text-[10px] text-[#6B6B6B] italic mt-0.5">{it.notes}</div>}
                      {it.reason && !ctx && !pkgCtx && <div className="text-[10px] text-[#6B6B6B] mt-0.5">{it.reason}</div>}
                    </td>
                    <td className="px-5 py-3 text-right font-mono">{fmtN(it.qty)}</td>
                    <td className="px-5 py-3">{it.uom}</td>
                    <td className="px-5 py-3 text-right font-mono"><span className="sensitive">{fmtRM(it.unit_cost)}</span></td>
                    <td className="px-5 py-3 text-right font-mono"><span className="sensitive">{fmtRM(it.amount)}</span></td>
                    <td className="px-5 py-3 font-mono text-[11px]">
                      {it.expected_date
                        ? <span className="text-[#1A1A1A]">{it.expected_date}</span>
                        : po.expected_date
                          ? <span className="text-[#6B6B6B]" title="Inherited from PO header">{po.expected_date}</span>
                          : <span className="text-[#6B6B6B]">—</span>}
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-[#FAFAF7] font-semibold border-t border-[#D4D0C7]">
                <td colSpan={4} className="px-5 py-3 text-right uppercase font-mono text-[10px] tracking-wider">Total</td>
                <td className="px-5 py-3 text-right font-mono">{fmtN(po.total_qty)}</td>
                <td colSpan={2}></td>
                <td className="px-5 py-3 text-right font-mono"><span className="sensitive">{fmtRM(po.total_amount)}</span></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Invoices: only relevant once goods are received (or partial). */}
        {(po.status === 'received' || po.status === 'partial_received' || po.status === 'approved') && (
          <div className="mt-8">
            <POInvoicesSection
              poId={po.id}
              poTotal={Number(po.total_amount) || 0}
              poLines={(po.items || []).map((it: any) => ({
                id: it.id,
                sku: it.sku,
                product_name: it.product_name,
                qty: Number(it.qty) || 0,
                received_qty: Number(it.received_qty) || 0,
                uom: it.uom,
                unit_cost: Number(it.unit_cost) || 0,
              }))}
              initialInvoices={invoices || []}
            />
          </div>
        )}
        </>}
      </div>
    </div>
  )
}

function MetaCard({ label, value, highlight, sensitive }: { label: string; value: string; highlight?: boolean; sensitive?: boolean }) {
  return (
    <div
      className="border border-[#D4D0C7] rounded p-3"
      style={{ backgroundColor: highlight ? '#FFF5F1' : 'white' }}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1">{label}</div>
      <div className={`text-[14px] font-medium ${highlight ? 'text-[#C8432C]' : 'text-[#1A1A1A]'}`}>
        {sensitive ? <span className="sensitive">{value}</span> : value}
      </div>
    </div>
  )
}
