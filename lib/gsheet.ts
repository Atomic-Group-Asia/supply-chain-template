// ============================================================================
//  GSheet integration stub (demo template)
//
//  The production version of this file talked to Google Sheets via a service
//  account to sync master data (suppliers / products / packaging / bom) and
//  live inventory (FG / HQ / Retailer). In this template that integration is
//  disabled — all data comes from `lib/demo-data/*.ts` instead.
//
//  These exports are kept as no-op stubs so the few callers that still
//  reference them (FG inventory aggregation, HQ/Retailer pages) compile
//  cleanly. They return empty arrays so the page logic short-circuits to
//  the database-backed (mock) data path.
//
//  To re-enable GSheet sync in your fork:
//    1. `npm i google-spreadsheet`  (already in package.json)
//    2. Replace this file with the real implementation
//    3. Set GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY env vars
// ============================================================================

export async function readSheetByGid(_sheetId: string, _gid: string): Promise<any[][]> {
  return []
}

export async function writeSheetCell(
  _sheetId: string, _sheetTitle: string, _cell: string, _value: string,
): Promise<void> {
  // no-op
}

export async function sheetTitleByGid(_sheetId: string, _gid: string): Promise<string> {
  return ''
}

export function colIndexToLetter(index: number): string {
  let s = ''
  let n = index
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}
