import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ============================================================================
//  Demo template — auth disabled.
//
//  Every request is forwarded as the synthetic "demo-admin" role, mirroring
//  the production middleware's contract (x-user-role header) so downstream
//  pages / API routes that read it still work.
//
//  To wire real auth in your fork, restore the cookie-session middleware
//  and point it at your own user store.
// ============================================================================

export async function middleware(req: NextRequest) {
  const headers = new Headers(req.headers)
  headers.set('x-user-role', 'admin')
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
