// Mash Cred: peer-given (reactions RECEIVED on your group-thread comments),
// group-scoped, and cosmetic. Milestone flair only — never a running number,
// never a leaderboard, never a penalty. See DESIGN.md "Reward loop law".

export function credFlair(cred: number): string | null {
  if (cred >= 200) return 'Cult Classic'
  if (cred >= 50) return 'House Critic'
  if (cred >= 10) return 'Seasoned'
  return null
}
