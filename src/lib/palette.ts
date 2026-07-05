// Avatar colours for live members (assigned by join order). The fixture
// screens keep their own per-id colours in fixtures.ts.
export const AVATAR_PALETTE = ['#e7b24e', '#51c5be', '#e07a5f', '#9c93ab'] as const

/** Colour for a member id, stable by join order within the members list. */
export function colorForMember(members: { userId: string }[], userId: string): string {
  const i = members.findIndex((m) => m.userId === userId)
  return AVATAR_PALETTE[(i >= 0 ? i : members.length) % AVATAR_PALETTE.length]
}
