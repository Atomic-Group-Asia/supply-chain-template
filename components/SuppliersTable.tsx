'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'

export function SuppliersTable({ suppliers }: { suppliers: any[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return suppliers
    return suppliers.filter(s =>
      s.supplier_code?.toLowerCase().includes(q) ||
      s.supplier_name?.toLowerCase().includes(q) ||
      s.primary_contact_name?.toLowerCase().includes(q) ||
      s.primary_contact_email?.toLowerCase().includes(q) ||
      s.primary_contact_phone?.toLowerCase().includes(q) ||
      s.notes?.toLowerCase().includes(q)
    )
  }, [suppliers, search])

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search code, name, contact, phone, email..."
          className="flex-1 max-w-[500px] bg-white border border-[#D4D0C7] rounded px-3 py-2 text-[13px] focus:outline-none focus:border-[#C8432C]"
        />
        {search && (
          <button onClick={() => setSearch('')} className="text-[11px] font-mono text-[#6B6B6B] px-2">Clear</button>
        )}
        <span className="ml-auto text-[11px] font-mono text-[#6B6B6B]">
          Showing {filtered.length} of {suppliers.length}
        </span>
      </div>

      <div className="bg-white border border-[#D4D0C7] rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-[#FAFAF7] border-b border-[#D4D0C7]">
            <tr>
              {['Code','Supplier','Type','Access','Contact','Notes'].map(h => (
                <th key={h} className="text-left px-3 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold whitespace-nowrap">{h}</th>
              ))}
              <th className="text-right px-3 py-3 font-mono text-[9px] uppercase tracking-wider text-[#6B6B6B] font-semibold whitespace-nowrap">›</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr
                key={s.id}
                className="border-b border-[#E8E5DE] hover:bg-[#FAFAF7] cursor-pointer transition-colors"
                onClick={() => router.push(`/suppliers/${encodeURIComponent(s.supplier_code)}`)}
              >
                <td className="px-3 py-3 font-mono text-[11px] font-medium whitespace-nowrap text-[#C8432C]">{s.supplier_code}</td>
                <td className="px-3 py-3 font-medium"><span className="sensitive">{s.supplier_name}</span></td>
                <td className="px-3 py-3">
                  <span className={`inline-block px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider font-semibold ${
                    s.supplier_type === 'OEM' ? 'bg-[#E4EDE0] text-[#4A6B3D]' :
                    s.supplier_type === 'Agent' ? 'bg-[#DDE8EF] text-[#2C5F7C]' :
                    'bg-[#E8E5DE] text-[#6B6B6B]'
                  }`}>{s.supplier_type}</span>
                </td>
                <td className="px-3 py-3">
                  <span className={`inline-block px-1.5 py-0.5 rounded font-mono text-[9px] uppercase tracking-wider font-semibold ${
                    s.access_model === 'Direct' ? 'bg-[#E4EDE0] text-[#4A6B3D]' :
                    'bg-[#F5EDD6] text-[#B8860B]'
                  }`}>{s.access_model}</span>
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{s.primary_contact_name ? <span className="sensitive">{s.primary_contact_name}</span> : '—'}</td>
                <td className="px-3 py-3 text-[#3D3D3D] max-w-[260px] truncate" title={s.notes || ''}>{s.notes ? <span className="sensitive">{s.notes}</span> : '—'}</td>
                <td className="px-3 py-3 text-right text-[#6B6B6B] font-mono">›</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[10px] font-mono text-[#6B6B6B]">
        Email · phone · payment terms · brands — click a row to view full supplier details.
      </div>

    </>
  )
}