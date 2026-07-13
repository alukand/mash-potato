// Push notification wiring. Native only: every entry point no-ops in the
// browser, so web dev and tests never touch the plugin. Registration happens
// after sign-in; the APNs token lands in public.device_tokens via RPC, and
// sign-out drops it again so a handed-around device stops buzzing.

import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { registerDeviceToken, removeDeviceToken, signOut } from './api'

let currentToken: string | null = null
let listenersBound = false

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
