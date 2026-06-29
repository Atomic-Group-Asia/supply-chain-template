// Maps a product brand → buyer entity (the legal company that issues the PO).
// In a multi-entity setup, edit this map so each brand routes to the right
// company on the generated PO PDF.

export const BRAND_TO_ENTITY: Record<string, string> = {
  'Brand A': 'YOURCO',
  'Brand B': 'YOURCO',
  'Brand C': 'YOURCO',
}

// Short brand codes used inside generated PO numbers when a PO is single-brand.
export const BRAND_CODE: Record<string, string> = {
  'Brand A': 'A',
  'Brand B': 'B',
  'Brand C': 'C',
}

export function brandToEntity(brand: string): string | null {
  return BRAND_TO_ENTITY[brand] || null
}

export function brandCode(brand: string): string {
  return BRAND_CODE[brand] || brand.slice(0, 3).toUpperCase()
}

export function yymm(d: Date = new Date()): string {
  const y = String(d.getFullYear()).slice(-2)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}${m}`
}
