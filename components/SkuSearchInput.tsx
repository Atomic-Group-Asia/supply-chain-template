'use client'

import { useState, useRef, useEffect } from 'react'

type Product = { sku: string; product_name?: string; brand?: string }

/**
 * Searchable SKU picker. Unlike the native <datalist>, this one shows
 * suggestions matching the query (in SKU code OR product name), and
 * supports the same SKU existing under multiple brands (e.g. Nattome MY
 * warehouse vs NattomeSG warehouse). Each (brand, sku) pair gets its own
 * row in the dropdown.
 *
 * Callers that need the brand from the picked row should pass `onSelect`
 * — it fires with the full Product object once the user clicks a row.
 * onChange continues to receive just the SKU string for backwards compat
 * with single-brand call sites.
 */
export function SkuSearchInput({
  value,
  onChange,
  onSelect,
  products,
  placeholder,
  selectedBrand,
}: {
  value: string
  onChange: (sku: string) => void
  onSelect?: (p: Product) => void
  products: Product[]
  placeholder?: string
  selectedBrand?: string  // when set, the green "selected" line below the input shows this brand
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // All rows whose SKU matches the typed value exactly. If multiple brands
  // share the SKU, multiple rows surface.
  const exactMatches = products.filter(p => p.sku === value.trim())
  const q = value.trim().toLowerCase()
  const suggestions = q
    ? products.filter(p =>
        p.sku.toLowerCase().includes(q) ||
        (p.product_name || '').toLowerCase().includes(q)
      ).slice(0, 12)
    : []

  // Hide suggestions only when we have a single unambiguous exact match
  // AND the caller has captured the brand (selectedBrand provided).
  const showSuggestions = open && suggestions.length > 0 && !(exactMatches.length === 1 && selectedBrand)

  const confirmedRow = exactMatches.find(p => p.brand === selectedBrand) || (exactMatches.length === 1 ? exactMatches[0] : null)

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        style={{
          width: '100%', padding: '8px 12px', border: '1px solid #D4D0C7',
          borderRadius: '4px', fontSize: '13px', backgroundColor: 'white',
          outline: 'none', fontFamily: 'var(--font-jetbrains-mono), monospace',
          boxSizing: 'border-box',
        }}
      />
      {showSuggestions && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '2px',
          background: 'white', border: '1px solid #D4D0C7', borderRadius: '4px',
          boxShadow: '0 6px 24px rgba(0,0,0,0.08)', zIndex: 50,
          maxHeight: '300px', overflowY: 'auto',
        }}>
          {suggestions.map(p => (
            <button
              key={`${p.brand || ''}::${p.sku}`}
              type="button"
              onClick={() => {
                onChange(p.sku)
                onSelect?.(p)
                setOpen(false)
              }}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 12px',
                background: 'none', border: 'none', borderBottom: '1px solid #F0EDE4',
                cursor: 'pointer', display: 'block',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#FAFAF7')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '12px', fontWeight: 500 }}>{p.sku}</div>
                {p.brand && (
                  <span style={{
                    fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '10px',
                    backgroundColor: '#E8E5DE', color: '#3D3D3D',
                    padding: '1px 6px', borderRadius: '3px',
                  }}>{p.brand}</span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: '#6B6B6B', marginTop: '2px' }}>
                {p.product_name || '—'}
              </div>
            </button>
          ))}
        </div>
      )}
      {/* Multi-brand exact match: prompt user to pick which warehouse */}
      {!showSuggestions && exactMatches.length > 1 && !selectedBrand && (
        <div style={{ marginTop: '6px', fontSize: '11px', color: '#A87B1F', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
          ⚠ SKU exists in {exactMatches.length} brands — pick one:
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
            {exactMatches.map(p => (
              <button
                key={`pick-${p.brand}`}
                type="button"
                onClick={() => { onSelect?.(p) }}
                style={{
                  padding: '3px 10px', borderRadius: '999px',
                  border: '1px solid #D4D0C7', backgroundColor: 'white',
                  fontFamily: 'var(--font-jetbrains-mono), monospace', fontSize: '11px',
                  cursor: 'pointer',
                }}
              >{p.brand}</button>
            ))}
          </div>
        </div>
      )}
      {confirmedRow && (
        <div style={{ marginTop: '4px', fontSize: '10px', color: '#4A6B3D', fontFamily: 'var(--font-jetbrains-mono), monospace' }}>
          ✓ {confirmedRow.product_name} · {confirmedRow.brand}
        </div>
      )}
    </div>
  )
}
