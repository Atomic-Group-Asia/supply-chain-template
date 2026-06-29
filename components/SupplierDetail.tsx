'use client'

import { useState } from 'react'
import Link from 'next/link'
import { EditSupplierModal } from './EditSupplierModal'

const fmtRM = (n: any) => n == null ? '—' : `RM ${Number(n).toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`

const statusColor: Record<string, string> = {
  pending: 'bg-[#F5EDD6] text-[#8B6F1B]',
  approved: 'bg-[#E8EFE5] text-[#4A6B3D]',
  rejected: 'bg-[#F5DEDA] text-[#A53025]',
  received: 'bg-[#DDE7F0] text-[#2C5282]',
  cancelled: 'bg-[#EDEAE2] text-[#6B6B6B]',
}

const paymentColor: Record<string, string> = {
  unpaid: 'bg-[#F5DEDA] text-[#A53025]',
  partial: 'bg-[#F5EDD6] text-[#8B6F1B]',
  paid: 'bg-[#E8EFE5] text-[#4A6B3D]',
}

type Summary = {
  totalPos: number
  owedAmount: number
  paidAmount: number
  activeAmount: number
}

export function SupplierDetail({ supplier, products, packaging, pos, summary }: { supplier: any; products: any[]; packaging: any[]; pos: any[]; summary?: Summary }) {
  const [editing, setEditing] = useState(false)
  return (
    <>
      <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">
            {supplier.supplier_code} · {(supplier.supplier_type || 'SUPPLIER').toUpperCase()}
          </div>
          <h1 className="text-3xl font-medium tracking-tight"><span className="sensitive">{supplier.supplier_name}</span></h1>
          <div className="text-sm text-[#6B6B6B] mt-1">
            {supplier.supplier_type ? `${supplier.supplier_type}` : ''}
            {supplier.access_model ? ` · ${supplier.access_model}` : ''}
            {products.length > 0 && ` · Supplies ${products.length} FG SKU${products.length > 1 ? 's' : ''}`}
            {packaging.length > 0 && ` · ${packaging.length} packaging item${packaging.length > 1 ? 's' : ''}`}
          </div>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="px-4 py-2 bg-[#1A1A1A] text-white rounded text-[13px] hover:bg-black"
        >
          ✎ Edit
        </button>
      </div>

      {/* Financial summary */}
      {summary && (
        <div className="grid grid-cols-4 gap-4 mb-4">
          <FinancialCard
            label="Total POs"
            value={summary.totalPos.toString()}
            sub={`RM ${summary.activeAmount.toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} active`}
            color="#1A1A1A"
          />
          <FinancialCard
            label="Owed to Supplier"
            value={`RM ${summary.owedAmount.toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`}
            sub={summary.owedAmount > 0 ? '⚠ outstanding balance' : '✓ all settled'}
            color={summary.owedAmount > 0 ? '#C8432C' : '#4A6B3D'}
            highlight
          />
          <FinancialCard
            label="Paid / Processed"
            value={`RM ${summary.paidAmount.toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`}
            sub="cumulative payments"
            color="#4A6B3D"
          />
          <FinancialCard
            label="Net Position"
            value={`RM ${(summary.activeAmount - summary.paidAmount).toLocaleString('en-MY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`}
            sub="active - paid"
            color="#6B6B6B"
          />
        </div>
      )}

      {/* Meta + Contact + Notes — packed into one tight section to keep
          the supplier page in one screen on most laptops. */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <MetaCard label="Type" value={supplier.supplier_type || '—'} />
        <MetaCard label="Access Model" value={supplier.access_model || '—'} />
        <MetaCard label="FG Payment Terms" value={supplier.payment_terms_fg || '—'} />
        <MetaCard label="Packaging Terms" value={supplier.payment_terms_pkg || '—'} />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <ContactCard title="Primary Contact"
          name={supplier.primary_contact_name}
          email={supplier.primary_contact_email}
          phone={supplier.primary_contact_phone}
          channel={supplier.primary_contact_channel}
        />
        <ContactCard title="Secondary Contact"
          name={supplier.secondary_contact_name}
          email={supplier.secondary_contact_email}
          phone={supplier.secondary_contact_phone}
          channel={supplier.secondary_contact_channel}
        />
      </div>

      {supplier.notes && (
        <div className="mb-3 p-2.5 border border-[#D4D0C7] bg-[#FAFAF7] rounded text-[11px] text-[#3D3D3D] flex gap-3 items-baseline">
          <span className="font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] shrink-0">Notes</span>
          <span className="sensitive">{supplier.notes}</span>
        </div>
      )}

      {/* Products supplied */}
      {products.length > 0 && (
        <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden mb-6">
          <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
            <div className="font-medium text-[15px]">FG SKUs Supplied ({products.length})</div>
          </div>
          <table className="w-full text-[12px]">
            <thead className="bg-white border-b border-[#E8E5DE]">
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
                <th className="px-6 py-2.5">SKU</th>
                <th className="px-6 py-2.5">Product</th>
                <th className="px-6 py-2.5">Brand</th>
                <th className="px-6 py-2.5 text-right">Unit Cost</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => (
                <tr key={p.sku} className="border-t border-[#F0EDE4] hover:bg-[#FAFAF7]">
                  <td className="px-6 py-2.5">
                    <Link href={`/products/${encodeURIComponent(p.sku)}`} className="font-mono text-[#C8432C] hover:underline">{p.sku}</Link>
                  </td>
                  <td className="px-6 py-2.5">{p.product_name}</td>
                  <td className="px-6 py-2.5">{p.brand || '—'}</td>
                  <td className="px-6 py-2.5 text-right font-mono"><span className="sensitive">{fmtRM(p.unit_cost)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Packaging supplied */}
      {packaging.length > 0 && (
        <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden mb-6">
          <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
            <div className="font-medium text-[15px]">Packaging Items Supplied ({packaging.length})</div>
          </div>
          <table className="w-full text-[12px]">
            <thead className="bg-white border-b border-[#E8E5DE]">
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
                <th className="px-6 py-2.5">Code</th>
                <th className="px-6 py-2.5">Name</th>
                <th className="px-6 py-2.5">Type</th>
                <th className="px-6 py-2.5 text-right">Unit Cost</th>
                <th className="px-6 py-2.5 text-right">Pack Size</th>
              </tr>
            </thead>
            <tbody>
              {packaging.map(p => (
                <tr key={p.packaging_code} className="border-t border-[#F0EDE4] hover:bg-[#FAFAF7]">
                  <td className="px-6 py-2.5">
                    <Link href={`/packaging/${encodeURIComponent(p.packaging_code)}`} className="font-mono text-[#C8432C] hover:underline">{p.packaging_code}</Link>
                  </td>
                  <td className="px-6 py-2.5">{p.packaging_name}</td>
                  <td className="px-6 py-2.5">
                    {p.packaging_type && <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-[#E8E5DE] text-[#3D3D3D]">{p.packaging_type}</span>}
                  </td>
                  <td className="px-6 py-2.5 text-right font-mono"><span className="sensitive">{fmtRM(p.unit_cost)}</span></td>
                  <td className="px-6 py-2.5 text-right font-mono">{p.pack_size ? Number(p.pack_size).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* POs */}
      {pos.length > 0 && (
        <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden mb-6">
          <div className="px-6 py-4 bg-[#FAFAF7] border-b border-[#D4D0C7] flex justify-between items-center">
            <div className="font-medium text-[15px]">Recent Purchase Orders ({pos.length})</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B]">Last 20</div>
          </div>
          <table className="w-full text-[12px]">
            <thead className="bg-white border-b border-[#E8E5DE]">
              <tr className="text-left text-[10px] uppercase tracking-wider text-[#6B6B6B] font-mono">
                <th className="px-6 py-2.5">PO Number</th>
                <th className="px-6 py-2.5">Type</th>
                <th className="px-6 py-2.5">Brands</th>
                <th className="px-6 py-2.5 text-right">Amount</th>
                <th className="px-6 py-2.5 text-right">Paid</th>
                <th className="px-6 py-2.5 text-right">Outstanding</th>
                <th className="px-6 py-2.5">Status</th>
                <th className="px-6 py-2.5">Payment</th>
                <th className="px-6 py-2.5">ETA</th>
              </tr>
            </thead>
            <tbody>
              {pos.map(po => {
                const total = Number(po.total_amount) || 0
                const paid = Number(po.paid_amount) || 0
                const outstanding = Math.max(0, total - paid)
                const ps = po.payment_status || 'unpaid'
                return (
                  <tr key={po.id} className="border-t border-[#F0EDE4] hover:bg-[#FAFAF7]">
                    <td className="px-6 py-2.5">
                      <Link href={`/purchase-orders/${po.id}`} className="font-mono text-[#C8432C] hover:underline">{po.po_number}</Link>
                    </td>
                    <td className="px-6 py-2.5">{po.po_type}</td>
                    <td className="px-6 py-2.5">{(po.brands || []).join(' + ')}</td>
                    <td className="px-6 py-2.5 text-right font-mono"><span className="sensitive">{fmtRM(total)}</span></td>
                    <td className="px-6 py-2.5 text-right font-mono text-[#4A6B3D]">{paid > 0 ? <span className="sensitive">{fmtRM(paid)}</span> : '—'}</td>
                    <td className="px-6 py-2.5 text-right font-mono text-[#C8432C]">{outstanding > 0 && po.status !== 'rejected' && po.status !== 'cancelled' ? <span className="sensitive">{fmtRM(outstanding)}</span> : '—'}</td>
                    <td className="px-6 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${statusColor[po.status] || 'bg-[#EDEAE2] text-[#6B6B6B]'}`}>{po.status}</span>
                    </td>
                    <td className="px-6 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${paymentColor[ps]}`}>{ps}</span>
                    </td>
                    <td className="px-6 py-2.5 text-[11px]">{po.expected_date || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && <EditSupplierModal supplier={supplier} onClose={() => setEditing(false)} />}
    </>
  )
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#D4D0C7] rounded p-3 bg-white">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1">{label}</div>
      <div className="text-[14px] font-medium">{value}</div>
    </div>
  )
}

function FinancialCard({ label, value, sub, color, highlight }: { label: string; value: string; sub: string; color: string; highlight?: boolean }) {
  return (
    <div
      className="border border-[#D4D0C7] rounded p-4 bg-white"
      style={{ backgroundColor: highlight ? '#FFF5F1' : 'white' }}
    >
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-2">{label}</div>
      <div className="text-[22px] font-medium font-mono" style={{ color }}><span className="sensitive">{value}</span></div>
      <div className="text-[11px] text-[#6B6B6B] mt-1 font-mono"><span className="sensitive">{sub}</span></div>
    </div>
  )
}

function ContactCard({ title, name, email, phone, channel }: { title: string; name?: string | null; email?: string | null; phone?: string | null; channel?: string | null }) {
  const hasAny = name || email || phone || channel
  return (
    <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
      <div className="px-4 py-2 bg-[#FAFAF7] border-b border-[#D4D0C7] font-medium text-[13px]">{title}</div>
      <div className="p-3 text-[12px] grid grid-cols-4 gap-3">
        {!hasAny && <div className="text-[#6B6B6B] italic col-span-4">No info</div>}
        {name && (
          <div><span className="font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] block">Name</span><span className="sensitive">{name}</span></div>
        )}
        {phone && (
          <div><span className="font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] block">Phone</span><span className="font-mono sensitive">{phone}</span></div>
        )}
        {email && (
          <div className="truncate"><span className="font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] block">Email</span><span className="font-mono sensitive">{email}</span></div>
        )}
        {channel && (
          <div><span className="font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] block">Channel</span><span className="sensitive">{channel}</span></div>
        )}
      </div>
    </div>
  )
}
