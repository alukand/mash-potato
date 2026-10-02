// Server-controlled feature flags (public.feature_flags), read once per launch
// and held in memory for the session.
//
// FAIL CLOSED is the whole design. A flag is ON only when the server returned
// a row for it whose `enabled` is literally `true`. An error, a timeout, a
// missing row, any other value, and "not loaded yet" all read as OFF. Nothing
// in this file can default a feature to on.
//
// Pure (the fetch is injected) so the rules are unit-tested; lib/flags.ts wires
// it to Supabase and React.

export type FlagRow = { key: unknown; enabled: unknown }

export interface FlagStore {
  /** Starts the session's single fetch. Later calls return the same promise. */
  load(): Promise<void>
  /** True only for a flag the server said is enabled. */
  isOn(key: string): boolean
  /** Whether the fetch has settled: answered, failed, or timed out. */
  isReady(): boolean
  subscribe(listener: () => void): () => void
}

export function createFlagStore(
  fetchRows: () => Promise<readonly FlagRow[] | null | undefined>,
  timeoutMs = 3000,
): FlagStore {
  let enabled = new Set<string>()
  let ready = false
  let loading: Promise<void> | null = null
  const listeners = new Set<() => void>()

  function settle(next: Set<string>) {
    enabled = next
    ready = true
    for (const listener of listeners) listener()
  }

  async function fetchOnce(): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('feature flags timed out')), timeoutMs)
    })
    try {
      const rows = await Promise.race([fetchRows(), timedOut])
      const next = new Set<string>()
      for (const row of Array.isArray(rows) ? rows : []) {
        if (row && typeof row.key === 'string' && row.enabled === true) next.add(row.key)
      }
      settle(next)
    } catch {
      // Off, for the rest of the session. A late answer after a timeout is
      // ignored too: the settled state never flips from off to on mid-session.
      settle(new Set())
    } finally {
      clearTimeout(timer)
    }
  }

  return {
    load() {
      loading ??= fetchOnce()
      return loading
    },
    isOn: (key) => enabled.has(key),
    isReady: () => ready,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}
