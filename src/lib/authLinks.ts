import { supabase } from './supabase'
import { parseAuthCallback } from './authCallback'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

let callbackError: string | null = null
const exchanges = new Map<string, Promise<void>>()

export function getAuthLinkError() { return callbackError }

/** Runs before React mounts, so auth and URL navigation cannot race to
 * consume the same one-use code. Strip credentials even on failure. */
async function handleAuthLink(url: string, native = false): Promise<void> {
  const callback = parseAuthCallback(url, window.location.origin, native)
  if (!callback) return
  if (!native) window.history.replaceState(null, '', '/')
  if (callback.kind === 'code') {
    const previous = exchanges.get(callback.code)
    if (previous) return previous
    const exchange = exchangeCode(callback.code)
    exchanges.set(callback.code, exchange)
    // Bound memory without retrying the same launch URL/event pair.
    if (exchanges.size > 10) exchanges.delete(exchanges.keys().next().value!)
    return exchange
  }
  showError()
}

async function exchangeCode(code: string): Promise<void> {
    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) { callbackError = null; return }
    } catch { /* Offer the code fallback without exposing auth URL details. */ }
    showError()
}

function showError() {
  callbackError = 'This sign-in link could not be opened. Open it on the device and browser where you requested it, or enter the code from your email. You can also request a fresh email.'
  window.dispatchEvent(new Event('mp:auth-link-error'))
}

export async function initializeAuthLinks(): Promise<void> {
  await handleAuthLink(window.location.href)
  if (!Capacitor.isNativePlatform()) return
  try {
    await App.addListener('appUrlOpen', ({ url }) => { void handleAuthLink(url, true) })
    const launch = await App.getLaunchUrl()
    if (launch?.url) await handleAuthLink(launch.url, true)
  } catch {
    // The email code still works if the native bridge is unavailable.
  }
}
