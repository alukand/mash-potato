// Who's in for a session. Pure logic, unit-tested; RSVP rows come from
// public.session_rsvps and expiry is computed here — never stored.
//
// Rules:
//   - Scoring a session ALWAYS means you're in (a passer can rejoin by rating).
//   - Otherwise an explicit RSVP decides: 'in' or 'pass'.
//   - No answer within RSVP_WINDOW_MS of the session's creation = pass.

export const RSVP_WINDOW_MS = 24 * 60 * 60 * 1000

export type RsvpStatus = 'in' | 'pass'
export type MemberParticipation = 'in' | 'passed' | 'invited'

export interface ParticipationArgs {
  memberIds: string[]
  /** Explicit answers (session_rsvps rows). */
  rsvps: { memberId: string; status: RsvpStatus }[]
  /** Members with a scorecard for the session (scored = in). */
  scoredMemberIds: string[]
  /** reveal_sessions.created_at (ISO). */
  sessionCreatedAt: string
  now?: Date
}

export interface Participation {
  /** Status per member id. */
  status: Map<string, MemberParticipation>
  inIds: string[]
  passedIds: string[]
  /** Invited, no answer yet, window still open. */
  invitedIds: string[]
  /** ms until unanswered invites become passes (0 when closed). */
  windowRemainingMs: number
}

export function participation({
  memberIds,
  rsvps,
  scoredMemberIds,
  sessionCreatedAt,
  now = new Date(),
}: ParticipationArgs): Participation {
  const scored = new Set(scoredMemberIds)
  const answers = new Map(rsvps.map((r) => [r.memberId, r.status]))
  const elapsed = now.getTime() - new Date(sessionCreatedAt).getTime()
  const windowRemainingMs = Math.max(0, RSVP_WINDOW_MS - elapsed)
  const windowOpen = windowRemainingMs > 0

  const status = new Map<string, MemberParticipation>()
  for (const id of memberIds) {
    if (scored.has(id)) status.set(id, 'in')
    else if (answers.get(id) === 'in') status.set(id, 'in')
    else if (answers.get(id) === 'pass') status.set(id, 'passed')
    else status.set(id, windowOpen ? 'invited' : 'passed')
  }

  const of = (s: MemberParticipation) =>
    memberIds.filter((id) => status.get(id) === s)
  return {
    status,
    inIds: of('in'),
    passedIds: of('passed'),
    invitedIds: of('invited'),
    windowRemainingMs,
  }
}

/** "23h" / "40m" / "closed" — how long invitees still have to answer. */
export function formatWindow(remainingMs: number): string {
  if (remainingMs <= 0) return 'closed'
  const hours = Math.floor(remainingMs / 3_600_000)
  if (hours >= 1) return `${hours}h`
  return `${Math.max(1, Math.floor(remainingMs / 60_000))}m`
}
