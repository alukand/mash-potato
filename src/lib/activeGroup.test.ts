import { describe, it, expect } from 'vitest'
import { pickActiveGroup } from './activeGroup'
import type { GroupInfo } from './api'

const groups: GroupInfo[] = [
  { id: 'g1', name: 'First', role: 'owner' },
  { id: 'g2', name: 'Second', role: 'member' },
]

describe('pickActiveGroup', () => {
  it('returns null when the user has no groups', () => {
    expect(pickActiveGroup([], null)).toBeNull()
    expect(pickActiveGroup([], 'g1')).toBeNull()
  })

  it('honours a stored id the user is still a member of', () => {
    expect(pickActiveGroup(groups, 'g2')?.id).toBe('g2')
  })

  it('falls back to the first (oldest) group when nothing is stored', () => {
    expect(pickActiveGroup(groups, null)?.id).toBe('g1')
  })

  it('falls back to the first group when the stored id is stale', () => {
    expect(pickActiveGroup(groups, 'gone')?.id).toBe('g1')
  })
})
