import { supabaseAdmin } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import { POPrintClient } from '@/components/POPrintClient'

export const dynamic = 'force-dynamic'

export default async function PrintPOPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: po } = await supabaseAdmin
    .from('purchase_orders')
    .select('*, items:purchase_order_items(*)')
    .eq('id', id)
    .single()

  if (!po) return notFound()

  const [{ data: entity }, { data: supplier }, { data: allSuppliers }] = await Promise.all([
    supabaseAdmin.from('buyer_entities').select('*').eq('code', po.entity_code).single(),
    po.supplier_code
      ? supabaseAdmin.from('suppliers').select('*').eq('supplier_code', po.supplier_code).single()
      : Promise.resolve({ data: null }),
    supabaseAdmin.from('suppliers').select('supplier_code, supplier_name, primary_contact_phone, primary_contact_name').order('supplier_name'),
  ])

  const items = (po.items || []).sort((a: any, b: any) => a.created_at.localeCompare(b.created_at))

  return (
    <POPrintClient
      po={po}
      items={items}
      entity={entity}
      supplier={supplier}
      allSuppliers={allSuppliers || []}
    />
  )
}
