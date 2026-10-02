import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFlagStore } from './featureFlags'

afterEach(() => {
  vi.useRealTimers()
})

describe('createFlagStore', () => {
  it('turns on only a flag whose row says enabled: true', async () => {
    const store = createFlagStore(async () => [
      { key: 'livestreaming', enabled: true },
      { key: 'other', enabled: false },
    ])
    await store.load()
    expect(store.isReady()).toBe(true)
    expect(store.isOn('livestreaming')).toBe(true)
    expect(store.isOn('other')).toBe(false)
  })

  it('is off while loading', () => {
    const store = createFlagStore(() => new Promise(() => {}))
    void store.load()
    expect(store.isReady()).toBe(false)
    expect(store.isOn('livestreaming')).toBe(false)
  })

  it('fails closed when the fetch errors', async () => {
    const store = createFlagStore(async () => {
      throw new Error('network down')
    })
    await store.load()
    expect(store.isReady()).toBe(true)
    expect(store.isOn('livestreaming')).toBe(false)
  })

  it('fails closed when the row is missing', async () => {
    const store = createFlagStore(async () => [{ key: 'something_else', enabled: true }])
    await store.load()
    expect(store.isOn('livestreaming')).toBe(false)
  })

  it('fails closed on an empty or absent answer', async () => {
    const empty = createFlagStore(async () => [])
    const absent = createFlagStore(async () => null)
    await Promise.all([empty.load(), absent.load()])
    expect(empty.isOn('livestreaming')).toBe(false)
    expect(absent.isOn('livestreaming')).toBe(false)
    expect(absent.isReady()).toBe(true)
  })

  it('treats anything but a literal true as off', async () => {
    const store = createFlagStore(async () => [
      { key: 'a', enabled: 'true' },
      { key: 'b', enabled: 1 },
      { key: 'c', enabled: null },
      { key: 7, enabled: true },
    ])
    await store.load()
    for (const key of ['a', 'b', 'c', '7']) expect(store.isOn(key)).toBe(false)
  })

  it('fails closed on a timeout, and ignores an answer that arrives after it', async () => {
    vi.useFakeTimers()
    let answer: (rows: { key: string; enabled: boolean }[]) => void = () => {}
    const store = createFlagStore(
      () => new Promise((resolve) => (answer = resolve)),
      3000,
    )
    const loading = store.load()
    await vi.advanceTimersByTimeAsync(3000)
    await loading
    expect(store.isReady()).toBe(true)
    expect(store.isOn('livestreaming')).toBe(false)

    answer([{ key: 'livestreaming', enabled: true }])
    await vi.runAllTimersAsync()
    expect(store.isOn('livestreaming')).toBe(false)
  })

  it('fetches once per session', async () => {
    const fetchRows = vi.fn(async () => [{ key: 'livestreaming', enabled: true }])
    const store = createFlagStore(fetchRows)
    await Promise.all([store.load(), store.load()])
    await store.load()
    expect(fetchRows).toHaveBeenCalledTimes(1)
  })

  it('tells subscribers when the flags settle, until they unsubscribe', async () => {
    const store = createFlagStore(async () => [{ key: 'livestreaming', enabled: true }])
    const heard = vi.fn()
    const stopped = vi.fn()
    store.subscribe(heard)
    store.subscribe(stopped)()
    await store.load()
    expect(heard).toHaveBeenCalledTimes(1)
    expect(stopped).not.toHaveBeenCalled()
  })
})
