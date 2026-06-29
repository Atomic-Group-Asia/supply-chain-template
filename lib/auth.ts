// ============================================================================
//  Demo template — auth stub.
//
//  The production app uses a HMAC-SHA256 cookie session. In the demo every
//  visitor is an admin (matches what middleware.ts forwards), so these
//  helpers just return constants.
// ============================================================================

export const SESSION_COOKIE = 'ops_session'

export type Role = 'admin' | 'viewer'

export async function verifySession(_token: string): Promise<{ role: Role } | null> {
  return { role: 'admin' }
}

export function checkCredentials(_user: string, _pass: string): Role | null {
  return 'admin'
}

export async function createSession(_role: Role): Promise<string> {
  return 'demo-session'
}

// Server-component helper — reads the current user's role.
export async function currentRole(): Promise<Role> {
  return 'admin'
}
