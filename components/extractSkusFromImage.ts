/**
 * Client-side SKU + qty extraction from an image. 100% free — uses
 * Tesseract.js (WebAssembly OCR) running in the browser. No API key.
 *
 * Works best for system screenshots (Google Sheets, Excel, WMS, etc.)
 * where text is crisp. Handwriting or low-resolution photos will give
 * patchy results — the user can review and fix before saving.
 */

type Product = { sku: string; product_name?: string; brand?: string }

export type ExtractedItem = { sku: string; qty: number }

/** Run OCR + match. Returns extracted items + raw OCR text + a list of
 *  SKU-like tokens that didn't match the catalog (so the UI can tell the
 *  user 'we saw N-DH-SOY-SAC but you don't have that in Products yet'). */
export async function extractSkusFromImage(
  file: File | Blob,
  products: Product[],
): Promise<{ items: ExtractedItem[]; rawText: string; unmatched: string[] }> {
  // Dynamic import keeps tesseract out of the initial bundle.
  const Tesseract = (await import('tesseract.js')).default

  // 2 preprocessing variants: normal + INVERTED (chips are typically
  // light text on dark — inverting yields dark text on light, which
  // Tesseract handles much better).
  const [normal, inverted] = await Promise.all([
    preprocessForOcr(file, false),
    preprocessForOcr(file, true),
  ])

  const tryPsm = async (canvas: HTMLCanvasElement, psm: number) => {
    const r = await Tesseract.recognize(canvas, 'eng', {
      tessedit_pageseg_mode: String(psm),
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_()×x:., \t\n',
    } as any)
    return (r?.data?.text || '').trim()
  }
  // 4 passes: normal+inverted × psm 6+11. Concatenate corpus.
  const passes = await Promise.all([
    tryPsm(normal, 6),
    tryPsm(normal, 11),
    tryPsm(inverted, 6),
    tryPsm(inverted, 11),
  ])
  const text = passes.join('\n')

  const items = matchSkusInText(text, products)
  const unmatched = findUnmatchedSkuTokens(text, products, items)
  return { items, rawText: text, unmatched }
}

/** Upscale + greyscale + contrast boost (+ optional inversion). Returns
 *  an HTMLCanvasElement Tesseract accepts directly. */
async function preprocessForOcr(file: File | Blob, invert: boolean): Promise<HTMLCanvasElement> {
  const img = await fileToImage(file)
  const scale = Math.max(1, Math.min(3, 1200 / Math.max(img.width, img.height)))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)

  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    let grey = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    if (invert) grey = 255 - grey
    const k = 10
    const x = (grey / 255 - 0.5) * k
    const v = 255 / (1 + Math.exp(-x))
    px[i] = px[i + 1] = px[i + 2] = v
  }
  ctx.putImageData(data, 0, 0)
  return canvas
}

function fileToImage(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

/** Find tokens that look like SKU codes (e.g. 'N-DH-SOY-SAC') but aren't
 *  in our products catalog. These signal a catalog-mismatch problem
 *  rather than an OCR problem. */
function findUnmatchedSkuTokens(text: string, products: Product[], matched: ExtractedItem[]): string[] {
  const known = new Set(products.map(p => p.sku.toUpperCase()))
  const matchedSet = new Set(matched.map(m => m.sku.toUpperCase()))
  // Pattern: at least 2 hyphens, mix of letters/digits — looks like a SKU
  const re = /[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){2,}/gi
  const found = new Set<string>()
  let m
  while ((m = re.exec(text)) !== null) {
    const tok = m[0].toUpperCase()
    if (known.has(tok)) continue
    if (matchedSet.has(tok)) continue
    found.add(tok)
  }
  return Array.from(found).slice(0, 6)
}

/** Pure text matcher — exported separately for tests.
 *
 *  Strategy: for each SKU in the catalog, find every occurrence in the
 *  text (case-insensitive, with simple OCR slop) and capture the FIRST
 *  number that appears nearby (handles formats like 'N-DH-SOY-SAC (1000)',
 *  'N-DH-SOY-SAC × 1000', 'N-DH-SOY-SAC: 1000', 'N-DH-SOY-SAC 1000 pcs').
 *  This is more robust than line-by-line because OCR often jams multiple
 *  SKU+qty pairs onto a single line (e.g. seller-SKU chips).
 */
export function matchSkusInText(text: string, products: Product[]): ExtractedItem[] {
  if (!text) return []
  const items: ExtractedItem[] = []
  const seen = new Set<string>()
  const origText = text.replace(/[—–]/g, '-')
  const slopText = slop(origText)

  // Try LONGER SKUs first. Otherwise a short SKU like 'NR' would beat
  // a more specific one like 'N-DR-MINT-15s' just because it's listed
  // earlier in the catalog (or the longer one didn't OCR cleanly).
  const sorted = [...products].sort((a, b) => b.sku.length - a.sku.length)

  // Track positions in slopText that have already been claimed by an
  // earlier match so two SKUs can't both grab the same substring.
  const claimed: Array<[number, number]> = []
  const isClaimed = (start: number, end: number) =>
    claimed.some(([s, e]) => !(end <= s || start >= e))

  for (const p of sorted) {
    const skuRaw = p.sku
    const skuSlop = slop(skuRaw)
    // Find the FIRST unclaimed, word-boundary occurrence
    let from = 0
    while (from <= slopText.length) {
      const idx = slopText.indexOf(skuSlop, from)
      if (idx < 0) break
      const end = idx + skuSlop.length
      // Require a non-alphanumeric boundary on either side, so 'NR'
      // can't match inside 'NRLE' or 'N R O' run-on garbage.
      const before = idx === 0 ? '' : slopText[idx - 1]
      const after = end >= slopText.length ? '' : slopText[end]
      const boundaryOK =
        (before === '' || /[^A-Z0-9]/.test(before)) &&
        (after === '' || /[^A-Z0-9]/.test(after))
      if (boundaryOK && !isClaimed(idx, end)) {
        // Found a clean match. Look for qty in the next 80 chars.
        const tail = origText.slice(end, end + 80)
        const m = tail.match(/[\s(:×x*]+(\d[\d,]*)/i)
        if (m) {
          const qty = parseInt(m[1].replace(/,/g, ''), 10)
          if (Number.isFinite(qty) && qty > 0 && !seen.has(skuRaw)) {
            seen.add(skuRaw)
            claimed.push([idx, end])
            items.push({ sku: skuRaw, qty })
            break
          }
        }
      }
      from = idx + 1
    }
  }

  // Fall back to the old line-by-line scan in case any SKU was missed
  // (e.g. wrapped across two lines so the tail-scan didn't catch it).
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    if (seen.size === products.length) break
    const sku = findSkuInLine(line, products)
    if (!sku || seen.has(sku)) continue
    const qty = findQty(line)
    if (!qty) continue
    seen.add(sku)
    items.push({ sku, qty })
  }

  return items
}

// ─── helpers ────────────────────────────────────────────────────────────

/** Aggressive OCR character normalization. Apply the SAME transform to
 *  both sides of any comparison — turning every error-prone glyph into a
 *  canonical bucket — so 'N-DH-SOY-SAC' and OCR-output 'N-0H-S0Y-SAG'
 *  collapse to the same fingerprint.
 *
 *  Common observed Tesseract confusions on chip/small-text screenshots:
 *    D ↔ 0/O/Q   B ↔ 8/3   G ↔ C/6   Y ↔ 0   I ↔ 1/l   S ↔ 5/$
 *    T ↔ 7        Z ↔ 2     E ↔ F     N ↔ M/H (less common)
 */
function slop(s: string): string {
  return s.toUpperCase()
    // 0/O/Q/D all collapse — D is the worst offender on chips
    .replace(/[0OQD]/g, 'O')
    // H frequently mis-read as 0/8 in small chip fonts → bucket with O too
    .replace(/H/g, 'O')
    .replace(/[1IL]/g, 'I')
    .replace(/[5S$]/g, 'S')
    .replace(/[8B]/g, 'B')
    .replace(/[6GC]/g, 'C')   // G ↔ C ↔ 6 all blur into one bucket
    .replace(/[2Z]/g, 'Z')
    .replace(/[7T]/g, 'T')
    .replace(/[YV]/g, 'Y')    // Y ↔ V (sans-serif chip fonts blur them)
    .replace(/[NWM]/g, 'N')   // N ↔ W ↔ M (similar stroke pattern)
}

/** Find a quantity number in the line. Prefer the LAST number that isn't
 *  embedded inside what looks like a SKU code or pack size. */
function findQty(line: string): number {
  // Pull all standalone integers
  const matches = [...line.matchAll(/(?<![\w-])(\d{1,3}(?:,\d{3})*|\d+)(?![\w-])/g)]
  if (matches.length === 0) return 0
  // Filter out tiny pack-size noise — but keep last match.
  // Last number on a line is almost always the qty column.
  const last = matches[matches.length - 1][1].replace(/,/g, '')
  const n = parseInt(last, 10)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Match a SKU from the catalog against this OCR line. Tries:
 *   1. Exact SKU substring (case-insensitive)
 *   2. SKU with minor OCR slop (0/O, 1/I, l/1 swaps)
 *   3. Product-name keyword overlap (≥2 distinctive words)
 */
function findSkuInLine(line: string, products: Product[]): string | null {
  const upper = line.toUpperCase().replace(/\s+/g, '')

  // 1. Exact match
  for (const p of products) {
    if (upper.includes(p.sku.toUpperCase())) return p.sku
  }

  // 2. OCR slop: 0↔O, 1↔I, l↔1, 5↔S
  const lineSlop = slop(line).replace(/\s+/g, '')
  for (const p of products) {
    if (lineSlop.includes(slop(p.sku).replace(/\s+/g, ''))) return p.sku
  }

  // 3. Product name keyword overlap
  const lineWords = new Set(
    line.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3)
  )
  let bestSku: string | null = null
  let bestScore = 0
  for (const p of products) {
    if (!p.product_name) continue
    const nameWords = p.product_name.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3)
    let score = 0
    for (const w of nameWords) {
      if (lineWords.has(w)) score++
    }
    if (score > bestScore && score >= 2) {
      bestScore = score
      bestSku = p.sku
    }
  }
  return bestSku
}
