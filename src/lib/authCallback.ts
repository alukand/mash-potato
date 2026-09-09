export type AuthCallback = { kind: 'code'; code: string } | { kind: 'error' } | null

/** Only our dedicated callback may start a session exchange. The PKCE
 * verifier stays on the device that requested the email. */
export const NATIVE_AUTH_REDIRECT = 'com.mashpotato.app://auth/callback'

export function parseAuthCallback(raw: string, webOrigin: string, allowNative = false): AuthCallback {
  let url: URL
  try { url = new URL(raw) } catch { return null }
  const web = url.origin === webOrigin && url.pathname === '/auth/callback'
  const native = allowNative && url.protocol === 'com.mashpotato.app:' && url.host === 'auth' && url.pathname === '/callback'
  if ((!web && !native) || url.username || url.password) return null
  if (url.hash || url.searchParams.has('error')) return { kind: 'error' }
  const codes = url.searchParams.getAll('code')
  if (codes.length !== 1 || !codes[0].trim() || codes[0].length > 2048) return { kind: 'error' }
  return { kind: 'code', code: codes[0] }
}
