// Avatar colours for live members (assigned by join order). The fixture
// screens keep their own per-id colours in fixtures.ts.
export const AVATAR_PALETTE = ['#e7b24e', '#51c5be', '#e07a5f', '#9c93ab'] as const

/** Colour for a member id, stable by join order within the members list. */
export function colorForMember(members: { userId: string }[], userId: string): string {
  const i = members.findIndex((m) => m.userId === userId)
  return AVATAR_PALETTE[(i >= 0 ? i : members.length) % AVATAR_PALETTE.length]
}

/** Stable colour hash of any id. */
function hashColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

/** Colour for a group id, stable across screens (hash of the id). */
export function colorForGroup(groupId: string): string {
  return hashColor(groupId)
}

/**
 * Colour for a user OUTSIDE any group context (friends lists), where no
 * join-order members list exists — stable hash of the id. Inside a group,
 * prefer colorForMember. Keeps the people/groups palette split greppable.
 */
export function colorForUser(userId: string): string {
  return hashColor(userId)
}
