import type { MemberInfo } from '../lib/api'
import { colorForMember } from '../lib/palette'
import { earnedBadges, nextBadge, shelf, tallyLine } from '../lib/trophies'
import type { TrophyCount } from '../lib/trophies'
import { Avatar } from './avatars'

// What the group has handed out: best takes and fights won on votes.
// Members with a win, in the group's own member order: never ranked by wins
// (DESIGN.md reward-loop law). Hidden until someone has won something.
export function TrophyShelf({
  counts,
  members,
  userId,
}: {
  counts: TrophyCount[]
  members: MemberInfo[]
  userId: string
}) {
  const rows = shelf(counts, members.map((m) => m.userId))
  if (rows.length === 0) return null

  return (
    <section className="mp-rise mb-7" style={{ animationDelay: '80ms' }}>
      <p className="mb-2.5 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
        Trophy shelf
      </p>
      <div className="mp-card rounded-[22px] px-4">
        <ul>
          {rows.map((r, i) => {
            const member = members.find((m) => m.userId === r.userId)
            const isYou = r.userId === userId
            const badges = earnedBadges(r.takeWins, r.fightWins)
            // your own next badge on each track you have started: a goal, not a rank
            const nexts = isYou
              ? [
                  r.takeWins > 0 ? nextBadge('take', r.takeWins) : null,
                  r.fightWins > 0 ? nextBadge('fight', r.fightWins) : null,
                ].filter((n) => n !== null)
              : []
            return (
              <li key={r.userId} className={`py-3.5 ${i > 0 ? 'border-t border-line/50' : ''}`}>
                <div className="flex items-start gap-3">
                  <Avatar
                    avatarKey={member?.avatarKey}
                    displayName={member?.displayName ?? 'Member'}
                    color={colorForMember(members, r.userId)}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium">
                      {member?.displayName ?? 'Member'}
                      {isYou && <span className="ml-1.5 text-muted">(you)</span>}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted">
                      {tallyLine(r.takeWins, r.fightWins)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {badges.map((b) => (
                        <span
                          key={b.name}
                          className={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-wide ${
                            b.track === 'take'
                              ? 'border-gold/30 bg-gold/10 text-gold'
                              : 'border-coral/30 bg-coral/10 text-coral'
                          }`}
                        >
                          {b.name}
                        </span>
                      ))}
                    </div>
                    {nexts.map((n) => (
                      <p key={n.badge.name} className="mt-1.5 text-[11px] leading-snug text-muted">
                        {n.remaining} more{' '}
                        {n.badge.track === 'take'
                          ? `best ${n.remaining === 1 ? 'take' : 'takes'}`
                          : `${n.remaining === 1 ? 'fight' : 'fights'} won`}{' '}
                        for {n.badge.name}.
                      </p>
                    ))}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
      <p className="mt-2 px-1 text-[12px] leading-snug text-muted">
        Every trophy here was voted for by the group. A forfeit doesn&apos;t count.
      </p>
    </section>
  )
}
