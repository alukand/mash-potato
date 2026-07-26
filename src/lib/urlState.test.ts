import { describe, it, expect } from 'vitest'
import { pathToState, stateToPath, type StackView } from './urlState'
import type { TabId } from '../components/BottomNav'

/** Every view kind, so a new one added without a URL fails loudly here. */
const VIEWS: StackView[] = [
  { kind: 'title', tmdbId: 27205, mediaType: 'movie' },
  { kind: 'title', tmdbId: 1399, mediaType: 'tv' },
  { kind: 'user', userId: '442dc827-84b2-4afd-9804-931419042f78' },
  { kind: 'playlist', playlistId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
  { kind: 'groupHistory', groupId: 'fca59af2-507b-4abf-9ef9-738f6c275dde' },
  { kind: 'messages' },
  { kind: 'thread', conversationId: 'eb3762e3-9653-4238-ba7d-fdd26737f2f6' },
  { kind: 'createGroup' },
]

describe('tabs', () => {
  const tabs: TabId[] = ['home', 'discover', 'rate', 'profile']

  it('round-trip every tab with an empty stack', () => {
    for (const tab of tabs) {
      const path = stateToPath(tab, [])
      expect(pathToState(path)).toEqual({ tab, stack: [] })
    }
  })

  it('home is the root path', () => {
    expect(stateToPath('home', [])).toBe('/')
  })
})

describe('stack views', () => {
  it('round-trip every view kind', () => {
    for (const view of VIEWS) {
      const path = stateToPath('home', [view])
      const back = pathToState(path)
      expect(back.stack[back.stack.length - 1]).toEqual(view)
    }
  })

  it('names films and shows distinctly', () => {
    expect(stateToPath('home', [{ kind: 'title', tmdbId: 27205, mediaType: 'movie' }])).toBe(
      '/film/27205',
    )
    expect(stateToPath('home', [{ kind: 'title', tmdbId: 1399, mediaType: 'tv' }])).toBe(
      '/show/1399',
    )
  })

  it('the TOP of the stack names the location', () => {
    const stack: StackView[] = [
      { kind: 'messages' },
      { kind: 'thread', conversationId: 'abc' },
    ]
    expect(stateToPath('home', stack)).toBe('/messages/abc')
  })

  it('a thread keeps the inbox beneath it, so Back reaches the message centre', () => {
    const { stack } = pathToState('/messages/abc')
    expect(stack).toEqual([{ kind: 'messages' }, { kind: 'thread', conversationId: 'abc' }])
  })

  it("a group's history sits under the Rate tab, not Home", () => {
    // Closing it should land on the group hub, which is where its own night
    // rows already send you.
    expect(pathToState('/group/g1/history').tab).toBe('rate')
    expect(pathToState('/film/27205').tab).toBe('home')
  })

  it('leaves the discussion seed out of the URL', () => {
    // A shared link must not reopen someone else's half-written comment prompt.
    const path = stateToPath('home', [
      { kind: 'title', tmdbId: 27205, mediaType: 'movie', discussGroupId: 'g1', discussSeed: 'why?' },
    ])
    expect(path).toBe('/film/27205')
    expect(pathToState(path).stack[0]).toEqual({
      kind: 'title',
      tmdbId: 27205,
      mediaType: 'movie',
    })
  })

  it('escapes ids that would otherwise break the path', () => {
    const weird = 'a/b?c#d'
    const path = stateToPath('home', [{ kind: 'playlist', playlistId: weird }])
    expect(path).not.toContain('a/b')
    expect(pathToState(path).stack[0]).toEqual({ kind: 'playlist', playlistId: weird })
  })
})

describe('bad input falls back to Home rather than a dead end', () => {
  const bad = [
    '/nope',
    '/film/not-a-number',
    '/film/0',
    '/film/-3',
    '/film', // missing id
    '/u', // missing id
    '/group/g1', // missing /history
    '/group/g1/members', // wrong leaf
    '/new-group/extra',
  ]

  it.each(bad)('%s -> home', (path) => {
    expect(pathToState(path)).toEqual({ tab: 'home', stack: [] })
  })

  it('tolerates trailing and doubled slashes', () => {
    expect(pathToState('/discover/')).toEqual({ tab: 'discover', stack: [] })
    expect(pathToState('//film//27205//').stack[0]).toEqual({
      kind: 'title',
      tmdbId: 27205,
      mediaType: 'movie',
    })
  })

  it('treats the native shell root as home', () => {
    // capacitor://localhost/ arrives here as just "/"
    expect(pathToState('/')).toEqual({ tab: 'home', stack: [] })
    expect(pathToState('')).toEqual({ tab: 'home', stack: [] })
  })
})
