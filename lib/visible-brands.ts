// Single source of truth for the list of brands shown across the UI.
//
// Edit the BRANDS array below to match your own product portfolio.
// To temporarily hide a brand (e.g. while data is being verified), remove it
// from the set — its SKUs stay in the DB but are filtered out of every list,
// alert, and chip filter.

export const BRANDS = ['Brand A', 'Brand B', 'Brand C'] as const

export const VISIBLE_BRANDS = new Set<string>(BRANDS)

export function isVisibleBrand(brand: string | null | undefined): boolean {
  if (!brand) return false
  return VISIBLE_BRANDS.has(brand)
}
