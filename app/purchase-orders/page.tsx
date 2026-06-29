import { supabaseAdmin } from '@/lib/supabase'
import { PurchaseOrdersTable } from '@/components/PurchaseOrdersTable'
import { CreateManualPOButton } from '@/components/CreateManualPOModal'
import { VISIBLE_BRANDS } from '@/lib/visible-brands'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PurchaseOrdersPage() {
  const [{ data: orders }, { data: suppliers }, { data: entities }, { data: products }, { data: packaging }] = await Promise.all([
    supabaseAdmin
      .from('purchase_orders')
      .select('*, items:purchase_order_items(*)')
      .order('created_at', { ascending: false }),
    // PO supplier dropdown = billing-side only. Exclude pure-OEM suppliers
    // (they make the product but don't invoice us — billing supplier does).
    supabaseAdmin.from('suppliers').select('supplier_code, supplier_name, supplier_type').neq('supplier_type', 'OEM').order('supplier_code'),
    supabaseAdmin.from('buyer_entities').select('code, legal_name, brands'),
    supabaseAdmin.from('products').select('sku, brand, product_name, unit_cost').order('brand').order('sku'),
    supabaseAdmin.from('packaging').select('packaging_code, packaging_name, packaging_type, unit_cost, uom').order('packaging_code'),
  ])

  // Build catalogs (filtered to visible brands so the picker only shows live SKUs)
  const productCatalog = (products || [])
    .filter(p => VISIBLE_BRANDS.has(p.brand))
    .map(p => ({
      sku: p.sku,
      brand: p.brand,
      product_name: p.product_name || p.sku,
      unit_cost: p.unit_cost,
      uom: 'pc', // FG unit cost is stored per piece
    }))

  // Packaging catalog. We treat `packaging_type` as the "brand-like" group
  // when it matches a tracked brand (Nattome etc.), else fall back to deriving
  // from the SKU prefix.
  function packagingBrand(p: any): string {
    const t = (p.packaging_type || '').trim()
    if (VISIBLE_BRANDS.has(t)) return t
    const code = (p.packaging_code || '') as string
    if (code.startsWith('N-')) return 'Nattome'
    if (code.startsWith('HH')) return 'HooHoo'
    if (code.startsWith('KH') || code.startsWith('KG') || code.startsWith('TP') || code.startsWith('NR')) return 'Heartio'
    return t || 'Other'
  }
  const packagingCatalog = (packaging || [])
    .map((p: any) => ({
      sku: p.packaging_code,
      brand: packagingBrand(p),
      product_name: p.packaging_name || p.packaging_code,
      unit_cost: p.unit_cost,
      uom: p.uom || 'pc',
    }))
    .filter(p => VISIBLE_BRANDS.has(p.brand))

  return (
    <div>
      <div className="bg-white border-b border-[#D4D0C7] px-7 py-3.5 sticky top-0 z-10 flex items-center justify-between">
        <div className="font-mono text-xs text-[#6B6B6B]">
          Your Company · <strong className="text-[#1A1A1A]">Purchase Orders</strong>
        </div>
        <div className="flex gap-2.5 items-center">
          <input
            type="text"
            placeholder="Search PO, supplier..."
            className="bg-[#FAFAF7] border border-[#D4D0C7] rounded px-3 py-1.5 text-[13px] w-[300px] focus:outline-none focus:border-[#C8432C]"
          />
        </div>
      </div>

      <div className="px-6 sm:px-12 py-6 max-w-[1180px] mx-auto">
        <div className="flex justify-between items-end pb-3.5 mb-6 border-b border-[#D4D0C7]">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-[#6B6B6B] mb-1">Procurement</div>
            <h1 className="text-3xl font-medium tracking-tight">Purchase Orders</h1>
            <div className="text-sm text-[#6B6B6B] mt-1">{orders?.length || 0} POs</div>
          </div>
          <div className="flex items-center gap-3">
            <CreateManualPOButton
              suppliers={suppliers || []}
              entities={(entities || []) as any}
              products={productCatalog}
              packaging={packagingCatalog}
            />
            <Link
              href="/purchase-decisions"
              className="px-3.5 py-2 bg-[#1A1A1A] text-white rounded text-[13px] hover:bg-black font-medium"
            >
              + Create PO
            </Link>
          </div>
        </div>

        <PurchaseOrdersTable orders={(orders || []) as any} />
      </div>
    </div>
  )
}
