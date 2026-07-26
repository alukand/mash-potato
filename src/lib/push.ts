// Push notification wiring. Native only: every entry point no-ops in the
// browser, so web dev and tests never touch the plugin. Registration happens
// after sign-in; the APNs token lands in public.device_tokens via RPC, and
// sign-out drops it again so a handed-around device stops buzzing.

import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { registerDeviceToken, removeDeviceToken, signOut } from './api'

let currentToken: string | null = null
let listenersBound = false
let openHandlerBound = false

/**
 * Bind the notification-TAP handler once, at app start and before sign-in
 * resolves, so a cold-start tap isn't dropped. The payload's custom keys are
 * ID-only routing data; App listens for the event and lands on the group.
 */
export async function bindPushOpenHandler(): Promise<void> {
  if (!Capacitor.isNativePlatform() || openHandlerBound) return
  openHandlerBound = true
  try {
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = (action.notification.data ?? {}) as Record<string, unknown>
      const groupId = typeof data.group_id === 'string' ? data.group_id : null
      // comment replies route to the title's discussion when the title has a
      // TMDB identity; otherwise the group tab is the fallback.
      const tmdbId =
        typeof data.tmdb_id === 'string' && data.tmdb_id !== '' ? Number(data.tmdb_id) : null
      const mediaType =
        data.media_type === 'movie' || data.media_type === 'tv' ? data.media_type : null
      // A message carries a conversation and NO group. Without this key in the
      // guard below, every message tap was silently dropped here.
      const conversationId =
        typeof data.conversation_id === 'string' && data.conversation_id !== ''
          ? data.conversation_id
          : null
      if (!groupId && !conversationId && (tmdbId === null || mediaType === null)) return
      window.dispatchEvent(
        new CustomEvent('mp:push-open', {
          detail: { groupId, tmdbId, mediaType, conversationId },
        }),
      )
    })
  } catch {
    // push must never break app start
  }
}

/** Ask for permission (first run) and register this device. Never throws. */
export async function enablePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    let perm = await PushNotifications.checkPermissions()
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions()
    }
    if (perm.receive !== 'granted') return
    if (!listenersBound) {
      listenersBound = true
      await PushNotifications.addListener('registration', (t) => {
        currentToken = t.value
        const platform = Capacitor.getPlatform() === 'android' ? 'android' : 'ios'
        void registerDeviceToken(t.value, platform).catch(() => {
          // best effort; the next app start retries
        })
      })
      await PushNotifications.addListener('registrationError', (err) => {
        console.warn('push registration failed', err)
      })
    }
    await PushNotifications.register()
  } catch {
    // push must never break app start
  }
}

/** Sign out, dropping this device's push token first (best effort). */
export async function signOutWithPushCleanup(): Promise<void> {
  if (currentToken) {
    try {
      await removeDeviceToken(currentToken)
    } catch {
      // best effort; the token also self-prunes on the next failed delivery
    }
    currentToken = null
  }
  await signOut()
}
