import { supabaseAdmin } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { SupplierDetail } from '@/components/SupplierDetail'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SupplierDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const decoded = decodeURIComponent(code)

  const { data: supplier } = await supabaseAdmin
    .from('suppliers').select('*').eq('supplier_code', decoded).single()

  if (!supplier) return notFound()

  // Find what this supplier supplies
  const [
    { data: products },
    { data: packaging },
    { data: pos },
    { data: allPos },
  ] = await Promise.all([
    supabaseAdmin
      .from('products')
      .select('sku, product_name, brand, unit_cost')
      .or(`oem_supplier_code.eq.${decoded},billing_supplier_code.eq.${decoded}`),
    supabaseAdmin
      .from('packaging')
      .select('packaging_code, packaging_name, packaging_type, unit_cost, pack_size')
      .eq('supplier_code', decoded),
    supabaseAdmin
      .from('purchase_orders')
      .select('id, po_number, po_type, status, payment_status, paid_amount, total_amount, expected_date, drafted_at, brands')
      .eq('supplier_code', decoded)
      .order('created_at', { ascending: false })
      .limit(20),
    supabaseAdmin
      .from('purchase_orders')
      .select('status, payment_status, total_amount, paid_amount')
      .eq('supplier_code', decoded),
  ])

  // Compute financial summary
  let totalPos = 0
  let owedAmount = 0
  let paidAmount = 0
  let activeAmount = 0
  for (const po of allPos || []) {
    if (po.status === 'cancelled' || po.status === 'rejected') continue
    totalPos++
    const total = Number(po.total_amount) || 0
    const paid = Number(po.paid_amount) || 0
    paidAmount += paid
    if (po.status === 'approved' || po.status === 'received') {
      activeAmount += total
      owedAmount += Math.max(0, total - paid)
    }
  }
  const summary = { totalPos, owedAmount, paidAmount, activeAmount }

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <Link href="/suppliers" className="hover:text-[#1A1A1A]">Suppliers</Link> · <strong className="text-[#1A1A1A]">{supplier.supplier_code}</strong>
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <SupplierDetail
          supplier={supplier}
          products={products || []}
          packaging={packaging || []}
          pos={pos || []}
          summary={summary}
        />
      </div>
    </div>
  )
}
