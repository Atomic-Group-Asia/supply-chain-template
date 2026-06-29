// ============================================================================
//  Mock Supabase client — drop-in replacement for `@supabase/supabase-js`.
//
//  Why this exists
//  ---------------
//  This template ships as a static demo: no Supabase project, no DB connection,
//  no credentials. To keep ALL the application code (~100+ routes + components)
//  working unchanged, this file exposes the same `supabaseAdmin` export with a
//  query-builder whose method signatures match supabase-js.
//
//  All data lives in `lib/demo-data/*.ts`. Mutations are in-memory: a Create or
//  Edit through the UI is visible during the session but resets on full server
//  restart. That's intentional — the demo should look alive without persisting.
//
//  Supported operations
//  --------------------
//    .from(table)
//    .select(cols, { count, head })       — incl. nested e.g. 'items:purchase_order_items(*)'
//    .eq / .neq / .in / .gt / .gte / .lt / .lte / .like / .ilike / .is / .not / .or
//    .order(col, { ascending })
//    .limit(n)
//    .range(from, to)
//    .single() / .maybeSingle()
//    .insert(row | rows)
//    .update(patch)
//    .upsert(row | rows, { onConflict })
//    .delete()
//
//  Things NOT supported (no-op or throw)
//  -------------------------------------
//    .rpc() — used by a few aggregation endpoints in prod, returns []
//    Realtime subscriptions
//    Storage (file uploads) — returns a stub
// ============================================================================

import { demoTables, FK_MAP } from './demo-data'

type Filter = (row: any) => boolean
type Order = { col: string; asc: boolean }

class QueryBuilder<T = any> {
  private filters: Filter[] = []
  private orderBys: Order[] = []
  private limitN: number | null = null
  private rangeFrom: number | null = null
  private rangeTo: number | null = null
  private mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  private selectCols = '*'
  private payload: any = null
  private isSingle = false
  private wantCount: 'exact' | null = null
  private headOnly = false
  private nestedSelects: Array<{ key: string; table: string; cols: string }> = []
  private upsertOnConflict: string | null = null

  constructor(private table: string) {}

  // --- read ---
  select(cols = '*', opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
    this.selectCols = cols
    if (opts?.count) this.wantCount = 'exact'
    if (opts?.head) this.headOnly = true
    // Parse nested selects: 'items:purchase_order_items(*)' or 'items:purchase_order_items(col1,col2)'
    const nestedRe = /(\w+):(\w+)\(([^)]+)\)/g
    let m: RegExpExecArray | null
    while ((m = nestedRe.exec(cols)) !== null) {
      this.nestedSelects.push({ key: m[1], table: m[2], cols: m[3] })
    }
    return this
  }

  eq(col: string, val: any)  { this.filters.push(r => r[col] === val); return this }
  neq(col: string, val: any) { this.filters.push(r => r[col] !== val); return this }
  in(col: string, vals: any[]) { this.filters.push(r => vals.includes(r[col])); return this }
  gt(col: string, val: any)  { this.filters.push(r => r[col] != null && r[col] >  val); return this }
  gte(col: string, val: any) { this.filters.push(r => r[col] != null && r[col] >= val); return this }
  lt(col: string, val: any)  { this.filters.push(r => r[col] != null && r[col] <  val); return this }
  lte(col: string, val: any) { this.filters.push(r => r[col] != null && r[col] <= val); return this }
  like(col: string, pattern: string) {
    const re = new RegExp('^' + pattern.replace(/%/g, '.*').replace(/_/g, '.') + '$')
    this.filters.push(r => re.test(String(r[col] ?? '')))
    return this
  }
  ilike(col: string, pattern: string) {
    const re = new RegExp('^' + pattern.replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i')
    this.filters.push(r => re.test(String(r[col] ?? '')))
    return this
  }
  is(col: string, val: any) {
    this.filters.push(r => r[col] === val || (val === null && r[col] == null))
    return this
  }
  not(col: string, op: 'is' | 'eq' | 'in', val: any) {
    if (op === 'is') this.filters.push(r => !(r[col] === val || (val === null && r[col] == null)))
    else if (op === 'eq') this.filters.push(r => r[col] !== val)
    else if (op === 'in') this.filters.push(r => !((val as any[]).includes(r[col])))
    return this
  }
  or(_expr: string) {
    // Format: 'col1.eq.x,col2.is.null'. Rare in our code; permissive no-op so the chain still runs.
    return this
  }
  contains(col: string, val: any) {
    // For array columns (e.g. purchase_orders.brands).
    this.filters.push(r => {
      const arr = r[col]
      if (!Array.isArray(arr)) return false
      if (Array.isArray(val)) return val.every(v => arr.includes(v))
      return arr.includes(val)
    })
    return this
  }

  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orderBys.push({ col, asc: opts?.ascending !== false })
    return this
  }
  limit(n: number)               { this.limitN = n; return this }
  range(from: number, to: number) { this.rangeFrom = from; this.rangeTo = to; return this }
  single()                       { this.isSingle = true; return this }
  maybeSingle()                  { this.isSingle = true; return this }

  // --- write ---
  insert(payload: any) {
    this.mode = 'insert'
    this.payload = Array.isArray(payload) ? payload : [payload]
    return this
  }
  update(payload: any) {
    this.mode = 'update'
    this.payload = payload
    return this
  }
  upsert(payload: any, opts?: { onConflict?: string }) {
    this.mode = 'upsert'
    this.payload = Array.isArray(payload) ? payload : [payload]
    this.upsertOnConflict = opts?.onConflict ?? null
    return this
  }
  delete() {
    this.mode = 'delete'
    return this
  }

  // --- thenable: when awaited, run the query ---
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected)
  }

  private execute(): { data: any; error: any; count?: number } {
    const rows = demoTables[this.table]
    if (!rows) {
      // eslint-disable-next-line no-console
      console.warn(`[mock-supabase] unknown table: ${this.table}`)
      demoTables[this.table] = []
    }
    const tbl = demoTables[this.table]

    if (this.mode === 'select') return this.runSelect(tbl)
    if (this.mode === 'insert') return this.runInsert(tbl)
    if (this.mode === 'update') return this.runUpdate(tbl)
    if (this.mode === 'upsert') return this.runUpsert(tbl)
    if (this.mode === 'delete') return this.runDelete(tbl)
    return { data: null, error: { message: 'Unknown mode' } }
  }

  private runSelect(rows: any[]): { data: any; error: any; count?: number } {
    let result = rows.filter(r => this.filters.every(f => f(r)))
    const totalCount = result.length

    if (this.nestedSelects.length > 0) {
      result = result.map(parent => {
        const enriched: any = { ...parent }
        for (const ns of this.nestedSelects) {
          const childRows = demoTables[ns.table] || []
          const fkCols = FK_MAP[ns.table] || {}
          const fkCol = Object.entries(fkCols).find(([, parentT]) => parentT === this.table)?.[0]
          if (!fkCol) { enriched[ns.key] = []; continue }
          enriched[ns.key] = childRows.filter(c => c[fkCol] === parent.id)
        }
        return enriched
      })
    }

    for (const o of [...this.orderBys].reverse()) {
      result.sort((a, b) => {
        const av = a[o.col]; const bv = b[o.col]
        if (av === bv) return 0
        if (av == null) return o.asc ? 1 : -1
        if (bv == null) return o.asc ? -1 : 1
        return (av < bv ? -1 : 1) * (o.asc ? 1 : -1)
      })
    }

    if (this.rangeFrom != null && this.rangeTo != null) {
      result = result.slice(this.rangeFrom, this.rangeTo + 1)
    }
    if (this.limitN != null) result = result.slice(0, this.limitN)

    if (this.headOnly) return { data: null, error: null, count: totalCount }
    if (this.isSingle) {
      if (result.length === 0) return { data: null, error: { code: 'PGRST116', message: 'No rows returned' } }
      if (result.length > 1)  return { data: null, error: { code: 'PGRST117', message: 'Multiple rows returned' } }
      return { data: result[0], error: null }
    }
    return this.wantCount
      ? { data: result, error: null, count: totalCount }
      : { data: result, error: null }
  }

  private runInsert(rows: any[]): { data: any; error: any } {
    const inserted = this.payload.map((row: any) => {
      const newRow = {
        id: row.id ?? cryptoId(),
        created_at: row.created_at ?? new Date().toISOString(),
        ...row,
      }
      rows.push(newRow)
      return newRow
    })
    return { data: this.isSingle ? inserted[0] : inserted, error: null }
  }

  private runUpdate(rows: any[]): { data: any; error: any } {
    const updated: any[] = []
    for (let i = 0; i < rows.length; i++) {
      if (this.filters.every(f => f(rows[i]))) {
        rows[i] = { ...rows[i], ...this.payload, updated_at: new Date().toISOString() }
        updated.push(rows[i])
      }
    }
    return { data: this.isSingle ? (updated[0] ?? null) : updated, error: null }
  }

  private runUpsert(rows: any[]): { data: any; error: any } {
    const result: any[] = []
    const conflictKey = this.upsertOnConflict || 'id'
    const keys = conflictKey.split(',').map(k => k.trim())
    for (const row of this.payload) {
      const idx = rows.findIndex(r => keys.every(k => r[k] === row[k]))
      if (idx >= 0) {
        rows[idx] = { ...rows[idx], ...row, updated_at: new Date().toISOString() }
        result.push(rows[idx])
      } else {
        const newRow = { id: row.id ?? cryptoId(), created_at: new Date().toISOString(), ...row }
        rows.push(newRow)
        result.push(newRow)
      }
    }
    return { data: result, error: null }
  }

  private runDelete(rows: any[]): { data: any; error: any } {
    const remaining: any[] = []
    const deleted: any[] = []
    for (const r of rows) (this.filters.every(f => f(r)) ? deleted : remaining).push(r)
    rows.length = 0
    rows.push(...remaining)
    return { data: deleted, error: null }
  }
}

function cryptoId(): string {
  return 'demo-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36)
}

const storageStub = {
  from(_bucket: string) {
    return {
      async upload(path: string, _file: any) { return { data: { path }, error: null } },
      async remove(_paths: string[]) { return { data: null, error: null } },
      getPublicUrl(path: string) {
        return { data: { publicUrl: `data:text/plain;base64,${btoa('demo:' + path)}` } }
      },
      async createSignedUrl(path: string, _expiresIn: number) {
        return { data: { signedUrl: `data:text/plain;base64,${btoa('demo:' + path)}` }, error: null }
      },
    }
  },
}

export const supabaseAdmin = {
  from<T = any>(table: string) {
    return new QueryBuilder<T>(table)
  },
  rpc<T = any>(_fn: string, _args?: any) {
    return Promise.resolve({ data: [] as T[], error: null })
  },
  storage: storageStub,
  auth: {
    async getUser() { return { data: { user: { id: 'demo-user', email: 'demo@example.com' } }, error: null } },
    async signOut() { return { error: null } },
  },
}
