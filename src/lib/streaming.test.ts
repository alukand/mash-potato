import { describe, expect, it } from 'vitest'
import {
  KNOWN_SERVICES,
  MORE_SERVICES,
  NO_STREAMING,
  SERVICES_SHOWN,
  parseStreamingPrefs,
  serviceNames,
  servicesFor,
  streamingFilterOf,
  streamingKey,
  streamingPhrase,
} from './streaming'
import type { StreamingService } from './streaming'

const svc = (id: number, name = `S${id}`): StreamingService => ({ id, name, logoPath: null })
const ids = (list: StreamingService[]) => list.map((s) => s.id)

// The US list as TMDB ranks it: HBO Max, Starz and Tubi far down, stores
// mixed in, live TV high up, and one service we can't place (Brew, 2736).
const US = [
  15, 8, 9, 350, 337, 2285, 10, 2, 257, 283, 2303, 2616, 386, 2383, 2736, 3, 192, 207, 526, 7, 1899, 43, 73,
].map((id) => svc(id))

// The UK's: its own majors early, Prime Video on 9, Paramount Plus on 531,
// and two we can't place (Curzon Home Cinema 189, BFI Player 224).
const UK = [8, 9, 350, 337, 2285, 2, 35, 283, 10, 531, 73, 103, 29, 38, 11, 3, 130, 189, 224, 41].map((id) =>
  svc(id),
)

describe('the known services', () => {
  it('lists each service once', () => {
    const known = KNOWN_SERVICES.map(([id]) => id)
    expect(new Set(known).size).toBe(known.length)
  })
})

describe('parseStreamingPrefs', () => {
  it('reads what Discover stored', () => {
    expect(parseStreamingPrefs(JSON.stringify({ mode: 'rent_buy', stream: [8, 1899], rent_buy: [2] }))).toEqual({
      mode: 'rent_buy',
      stream: [8, 1899],
      rent_buy: [2],
    })
  })

  it('treats anything malformed as no filter', () => {
    expect(parseStreamingPrefs(null)).toEqual(NO_STREAMING)
    expect(parseStreamingPrefs('not json')).toEqual(NO_STREAMING)
    expect(parseStreamingPrefs('[8]')).toEqual(NO_STREAMING)
    expect(parseStreamingPrefs(JSON.stringify({ mode: 'free', stream: [8, -1, 'x', 2.5, 8] }))).toEqual({
      mode: 'stream',
      stream: [8],
      rent_buy: [],
    })
  })
})

describe('streamingFilterOf', () => {
  const prefs = { mode: 'stream' as const, stream: [8, 1899], rent_buy: [2] }

  it("is the mode's own picks", () => {
    expect(streamingFilterOf(prefs, null)).toEqual({ providerIds: [8, 1899], monetization: 'stream' })
    expect(streamingFilterOf({ ...prefs, mode: 'rent_buy' }, null)).toEqual({
      providerIds: [2],
      monetization: 'rent_buy',
    })
  })

  it('is no filter when the mode has nothing picked', () => {
    expect(streamingFilterOf({ ...prefs, stream: [] }, null)).toBeNull()
    expect(streamingFilterOf(NO_STREAMING, US)).toBeNull()
  })

  it("drops a pick the region doesn't list, once the list is in", () => {
    expect(streamingFilterOf(prefs, [svc(8)])).toEqual({ providerIds: [8], monetization: 'stream' })
    expect(streamingFilterOf(prefs, [svc(15)])).toBeNull()
    // no list (an older tmdb-search, or it failed): the section is hidden,
    // so nothing filters unseen
    expect(streamingFilterOf(prefs, [])).toBeNull()
  })
})

describe('streamingKey', () => {
  it('ignores pick order and is empty for no filter', () => {
    expect(streamingKey({ providerIds: [1899, 8], monetization: 'stream' })).toBe(
      streamingKey({ providerIds: [8, 1899], monetization: 'stream' }),
    )
    expect(streamingKey({ providerIds: [8], monetization: 'stream' })).not.toBe(
      streamingKey({ providerIds: [8], monetization: 'rent_buy' }),
    )
    expect(streamingKey(null)).toBe('')
  })
})

describe('servicesFor', () => {
  it('leads Stream with the known services in our order, HBO Max included', () => {
    const { main, more } = servicesFor(US, 'stream', [])
    expect(ids(main)).toEqual([8, 9, 337, 1899, 15, 350, 386, 2303, 2616, 283, 43, 73])
    expect(main).toHaveLength(SERVICES_SHOWN)
    // the rest of the known ones, live TV last, then the ones we can't place
    expect(ids(more)).toEqual([207, 526, 257, 2383, 2285, 2736])
  })

  it("puts a region's own majors right after the global ones", () => {
    expect(ids(servicesFor(UK, 'stream', []).main)).toEqual([8, 9, 337, 350, 531, 38, 41, 103, 29, 283, 73, 11])
    expect(ids(servicesFor(UK, 'rent_buy', []).main)).toEqual([10, 2, 3, 35, 130])
  })

  it('never offers a store under Stream, or a subscription under Rent or buy', () => {
    const stream = servicesFor(US, 'stream', [])
    const stores = [10, 2, 3, 192, 7]
    expect([...ids(stream.main), ...ids(stream.more)].filter((id) => stores.includes(id))).toEqual([])

    const rent = servicesFor(US, 'rent_buy', [])
    expect(ids(rent.main)).toEqual([10, 2, 3, 192, 7])
    // only the services we can't place wait behind "More services"
    expect(ids(rent.more)).toEqual([2736])
  })

  it('opens to a few dozen more, not the whole region', () => {
    const big = [...US, ...Array.from({ length: 150 }, (_, i) => svc(5000 + i))]
    expect(servicesFor(big, 'stream', []).more).toHaveLength(MORE_SERVICES)
  })

  it('always shows a picked service', () => {
    const { main, more } = servicesFor(US, 'stream', [73])
    expect(ids(main)).toContain(73)
    expect(ids(more)).not.toContain(73)
  })

  it("tops Stream up from the region's list where we know few services", () => {
    const elsewhere = [8, 119, 1001, 1002, 1003, 337, 10, 2].map((id) => svc(id))
    expect(ids(servicesFor(elsewhere, 'stream', []).main)).toEqual([8, 119, 337, 1001, 1002, 1003])
    expect(ids(servicesFor(elsewhere, 'rent_buy', []).main)).toEqual([10, 2])
  })
})

describe('the summary line', () => {
  it('names the services', () => {
    expect(serviceNames([8], [svc(8, 'Netflix')])).toBe('Netflix')
    expect(serviceNames([8, 1899, 15], [svc(8, 'Netflix'), svc(1899, 'HBO Max'), svc(15, 'Hulu')])).toBe(
      'Netflix, HBO Max or Hulu',
    )
    expect(
      streamingPhrase({ providerIds: [2], monetization: 'rent_buy' }, [svc(2, 'Apple TV Store')]),
    ).toBe('rent or buy on Apple TV Store')
  })

  it('counts them before the list is in', () => {
    expect(serviceNames([8, 1899], null)).toBe('2 services')
    expect(serviceNames([8], null)).toBe('your service')
  })
})
