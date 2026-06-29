// Shared date/time formatters. All locked to Malaysia timezone so the UI
// matches what users see on the wall clock — regardless of Vercel server
// region or the user's browser locale.

const MY_TZ = 'Asia/Kuala_Lumpur'

/** "19/05/2026, 10:12:45" — date + time in Malaysia time. */
export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-GB', { timeZone: MY_TZ })
}

/** "19/05/2026" — date only in Malaysia time. */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { timeZone: MY_TZ })
}

/** "Monday, 19 May 2026" — long form for briefs. */
export function fmtDateLong(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: MY_TZ })
}

/** "10:12 AM" — time only in Malaysia time, for chat timestamps etc. */
export function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return ''
  const date = typeof d === 'string' ? new Date(d) : d
  if (isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: MY_TZ })
}
