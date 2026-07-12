import { describe, it, expect } from 'vitest'
import { participation, formatWindow, RSVP_WINDOW_MS } from './rsvp'

const T0 = '2026-07-11T12:00:00Z'
const at = (offsetMs: number) => new Date(new Date(T0).getTime() + offsetMs)

const base = {
  memberIds: ['ana', 'ben', 'cara'],
  sessionCreatedAt: T0,
}

describe('participation', () => {
  it('treats scoring as being in, regardless of RSVP', () => {
    const p = participation({
      ...base,
      rsvps: [{ memberId: 'ana', status: 'pass' }],
      scoredMemberIds: ['ana'],
      now: at(1000),
    })
    expect(p.status.get('ana')).toBe('in')
  })

  it('honours explicit answers and leaves the rest invited while the window is open', () => {
    const p = participation({
      ...base,
      rsvps: [
        { memberId: 'ana', status: 'in' },
        { memberId: 'ben', status: 'pass' },
      ],
      scoredMemberIds: [],
      now: at(1000),
    })
    expect(p.inIds).toEqual(['ana'])
    expect(p.passedIds).toEqual(['ben'])
    expect(p.invitedIds).toEqual(['cara'])
    expect(p.windowRemainingMs).toBeGreaterThan(0)
  })

  it('turns unanswered invites into passes after 24 hours', () => {
    const p = participation({
      ...base,
      rsvps: [{ memberId: 'ana', status: 'in' }],
      scoredMemberIds: [],
      now: at(RSVP_WINDOW_MS + 1),
    })
    expect(p.inIds).toEqual(['ana'])
    expect(p.passedIds).toEqual(['ben', 'cara'])
    expect(p.invitedIds).toEqual([])
    expect(p.windowRemainingMs).toBe(0)
  })

  it('lets a passer rejoin by scoring after the window closed', () => {
    const p = participation({
      ...base,
      rsvps: [{ memberId: 'ben', status: 'pass' }],
      scoredMemberIds: ['ben'],
      now: at(RSVP_WINDOW_MS * 2),
    })
    expect(p.status.get('ben')).toBe('in')
  })
})

describe('formatWindow', () => {
  it('formats hours, minutes, and closed', () => {
    expect(formatWindow(23.5 * 3_600_000)).toBe('23h')
    expect(formatWindow(40 * 60_000)).toBe('40m')
    expect(formatWindow(0)).toBe('closed')
  })
})
