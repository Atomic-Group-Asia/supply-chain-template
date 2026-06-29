// ============================================================================
//  Template config — edit these to brand the demo for your own use.
//  Defaults work without any env vars (zero-config Vercel deploy).
// ============================================================================

export const COMPANY_NAME =
  process.env.NEXT_PUBLIC_COMPANY_NAME?.trim() || 'Your Company'

// Two-warehouse model. Defaults reflect the most common pattern: a head-office
// warehouse + a retail/consignment one. Override per deployment via env vars.
export const WAREHOUSES = {
  hq:       process.env.NEXT_PUBLIC_WAREHOUSE_HQ_NAME?.trim()       || 'HQ',
  retailer: process.env.NEXT_PUBLIC_WAREHOUSE_RETAILER_NAME?.trim() || 'Retailer',
}

export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY?.trim() || 'RM'

// Whether the AI agent tab is enabled. The agent tab itself shows a
// "configure your DeepSeek key" placeholder when this is true but
// DEEPSEEK_API_KEY is not set.
export const AGENT_ENABLED =
  (process.env.NEXT_PUBLIC_AGENT_ENABLED ?? 'true').toLowerCase() === 'true'
