// The app's feature flags: one store for the session, loaded at launch
// (main.tsx), read through hooks. The rules live in featureFlags.ts; above all,
// it fails closed, so every flag reads OFF until the server says otherwise.

import { useSyncExternalStore } from 'react'
import { fetchFeatureFlagRows } from './api'
import { createFlagStore } from './featureFlags'

/** Every flag the app knows. A row in feature_flags that is not listed here does nothing. */
export type FeatureFlag = 'rewards'

export const flagStore = createFlagStore(fetchFeatureFlagRows)

/** Whether a server flag is on. False while loading, and on any failure. */
export function useFeatureFlag(key: FeatureFlag): boolean {
  return useSyncExternalStore(flagStore.subscribe, () => flagStore.isOn(key))
}

/** Whether the launch fetch has settled, so "off" is the final answer. */
export function useFeatureFlagsReady(): boolean {
  return useSyncExternalStore(flagStore.subscribe, flagStore.isReady)
}
