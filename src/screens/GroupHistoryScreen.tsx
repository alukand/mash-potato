import { useEffect, useState } from 'react'
import { fetchGroupHistory, fetchMembers, posterUrl } from '../lib/api'
import type { GroupHistoryNight, MemberInfo } from '../lib/api'
import {
  commonGround,
  groupRecap,
  myTilt,
  sorestSpot,
  tasteTwins,
  MIN_NIGHTS_FOR_A_CLAIM,
  type CategoryGap,
  type PairAgreement,
  type RecapNight,
} from '../lib/affinity'
import { formatScore } from '../lib/scoring'
import { scoreColor } from '../lib/scoreColor'
import { colorForMember } from '../lib/palette'
import { Avatar } from '../components/avatars'

interface GroupHistoryScreenProps {
  groupId: string
  groupName: string
  userId: string
  /** Reopen that night's Reveal back on the Rate tab. */
  onOpenSession: (sessionId: string) => void
  onBack: () => void
}

/** One number with a label, the recap's unit of currency. */
function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div className="flex-1 rounded-2xl border border-line/60 bg-surface-2/50 px-3 py-3 text-center">
      <p className="tabular font-display text-[24px] font-semibold" style={tint ? { color: tint } : undefined}>
        {value}
      </p>
      <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted">{label}</p>
    </div>
  )
}

/** A night, named and tappable — every claim here leads back to its Reveal. */
function NightRow({
  label,
  night,
  suffix,
  onOpen,
}: {
  label: string
  night: RecapNight
  suffix: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left transition-colors active:bg-surface-2"
    >
      <span className="min-w-0">
        <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-muted">{label}</span>
        <span className="block truncate text-[14px] font-semibold">{night.titleName}</span>
      </span>
      <span className="tabular shrink-0 font-mono text-[12px] text-muted">{suffix}</span>
    </button>
  )
}

/**
 * How close two people sit, said in words rather than a bare number — "0.6
 * apart" means nothing to anyone who has not been staring at this data.
 */
function closenessWord(meanGap: number): string {
  if (meanGap < 0.8) return 'joined at the hip'
  if (meanGap < 1.6) return 'usually on the same page'
  if (meanGap < 2.6) return 'often a bit apart'
  return 'rarely in the same room'
}

function gapLine(gap: CategoryGap): string {
  return `${gap.label} — ${formatScore(gap.meanGap)} apart on average, over ${gap.nights} ${
    gap.nights === 1 ? 'night' : 'nights'
  }`
}

/**
 * Below this two people are genuinely close on a category; above it, calling
 * it agreement would be a lie. `commonGround` returns the LEAST bad category,
 * which for a real mismatch can still be five points wide — "you agree on
 * Acting, 4.7 apart" is nonsense, so the wording has to earn itself.
 */
const AGREEMENT_GAP = 1.6
/** Below this a "clash" is not a clash, it is rounding. */
const CLASH_GAP = 1.5

/** The twin/foil card: a name, a verdict, and the two categories behind it. */
function PairCard({
  heading,
  member,
  agreement,
  members,
}: {
  heading: string
  member: MemberInfo
  agreement: PairAgreement
  members: MemberInfo[]
}) {
  const sore = sorestSpot(agreement)
  const common = commonGround(agreement)
  return (
    <div className="mp-card rounded-[22px] p-5">
      <p className="mb-3 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">{heading}</p>
      <div className="flex items-center gap-3">
        <Avatar
          avatarKey={member.avatarKey}
          displayName={member.displayName}
          color={colorForMember(members, member.userId)}
          size={44}
        />
        <div className="min-w-0">
          <p className="truncate font-display text-[19px] font-semibold">{member.displayName}</p>
          <p className="text-[12px] text-muted">
            {closenessWord(agreement.meanGap ?? 0)} · {formatScore(agreement.meanGap)} apart over{' '}
            {agreement.nights} nights
          </p>
        </div>
      </div>
      {(common || sore) && (
        <ul className="mt-4 flex flex-col gap-2 border-t border-line/50 pt-3">
          {common && (
            <li className="flex items-start gap-2 text-[12px] leading-snug">
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
              <span>
                <span className="text-muted">
                  {common.meanGap <= AGREEMENT_GAP ? 'You agree on ' : 'Closest you get is '}
                </span>
                {gapLine(common)}
              </span>
            </li>
          )}
          {sore && sore.category !== common?.category && sore.meanGap >= CLASH_GAP && (
            <li className="flex items-start gap-2 text-[12px] leading-snug">
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
              <span>
                <span className="text-muted">You clash on </span>
                {gapLine(sore)}
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}

/**
 * The group's whole run: the recap, the category it keeps arguing over, and
 * who the viewer actually agrees with. Everything is computed client-side from
 * the same two queries the group log already runs (`fetchGroupHistory`).
 *
 * Deliberately absent: any table that ranks members. See DESIGN.md's reward
 * loop law — a sorted list of people is a leaderboard whatever it is made of.
 * The viewer sees their OWN tilt against the group, and nobody else's.
 */
export function GroupHistoryScreen({
  groupId,
  groupName,
  userId,
  onOpenSession,
  onBack,
}: GroupHistoryScreenProps) {
  const [nights, setNights] = useState<GroupHistoryNight[] | undefined>(undefined)
  const [members, setMembers] = useState<MemberInfo[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setNights(undefined)
    setError(null)
    Promise.all([fetchGroupHistory(groupId), fetchMembers(groupId)])
      .then(([h, m]) => {
        if (cancelled) return
        setNights(h)
        setMembers(m)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Could not load the history')
        setNights([])
      })
    return () => {
      cancelled = true
    }
  }, [groupId])

  const recap = nights ? groupRecap(nights) : null
  const twins = nights ? tasteTwins(nights, userId, members.map((m) => m.userId)) : null
  const tilt = nights ? myTilt(nights, userId) : null
  const memberById = (id: string) => members.find((m) => m.userId === id) ?? null

  return (
    <div className="px-5 pt-safe pb-10">
      <header className="mp-rise mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line/60 text-text transition-colors hover:text-teal"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 5-7 7 7 7" />
          </svg>
        </button>
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted">The story so far</p>
          <h1 className="truncate font-display text-[22px] font-semibold leading-tight">{groupName}</h1>
        </div>
      </header>

      {error && (
        <p className="mb-4 rounded-2xl border border-coral/30 bg-coral/5 px-4 py-3 text-[13px] text-coral">
          {error}
        </p>
      )}

      {nights === undefined && (
        <p className="px-1 font-mono text-[11px] text-muted">reading the log…</p>
      )}

      {/* Below the floor there is nothing honest to say, so say that. */}
      {recap && recap.nights < MIN_NIGHTS_FOR_A_CLAIM && (
        <div className="mp-card rounded-[22px] p-6 text-center">
          <p className="font-display text-[19px] font-semibold">Not enough nights yet</p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {recap.nights === 0
              ? 'Rate something together and this fills in.'
              : `${recap.nights} ${recap.nights === 1 ? 'night' : 'nights'} in. After ${MIN_NIGHTS_FOR_A_CLAIM}, this page can tell you who you actually agree with — before that it would just be guessing.`}
          </p>
        </div>
      )}

      {recap && recap.nights >= MIN_NIGHTS_FOR_A_CLAIM && (
        <div className="flex flex-col gap-6">
          {/* ---- the run, in numbers ---- */}
          <section className="mp-rise flex gap-2">
            <Stat label="Nights" value={String(recap.nights)} />
            <Stat
              label="Average"
              value={formatScore(recap.averageMashed)}
              tint={recap.averageMashed !== null ? scoreColor(recap.averageMashed) : undefined}
            />
            {tilt && tilt.mine !== null && tilt.group !== null && (
              <Stat
                label="You run"
                value={`${tilt.mine - tilt.group >= 0 ? '+' : '−'}${formatScore(Math.abs(tilt.mine - tilt.group))}`}
              />
            )}
          </section>

          {/* ---- the nights worth remembering ---- */}
          <section className="mp-rise mp-card rounded-[22px] p-4" style={{ animationDelay: '60ms' }}>
            <div className="flex flex-col divide-y divide-line/40">
              {recap.highest && (
                <NightRow
                  label="Best night"
                  night={recap.highest}
                  suffix={`${formatScore(recap.highest.value)} mashed`}
                  onOpen={() => onOpenSession(recap.highest!.sessionId)}
                />
              )}
              {recap.lowest && recap.lowest.sessionId !== recap.highest?.sessionId && (
                <NightRow
                  label="Roughest night"
                  night={recap.lowest}
                  suffix={`${formatScore(recap.lowest.value)} mashed`}
                  onOpen={() => onOpenSession(recap.lowest!.sessionId)}
                />
              )}
              {recap.mostDivisive && (
                <NightRow
                  label="Biggest fight"
                  night={recap.mostDivisive}
                  suffix={`${formatScore(recap.mostDivisive.value)} apart`}
                  onOpen={() => onOpenSession(recap.mostDivisive!.sessionId)}
                />
              )}
              {recap.mostUnited && recap.mostUnited.sessionId !== recap.mostDivisive?.sessionId && (
                <NightRow
                  label="Closest call"
                  night={recap.mostUnited}
                  suffix={`${formatScore(recap.mostUnited.value)} apart`}
                  onOpen={() => onOpenSession(recap.mostUnited!.sessionId)}
                />
              )}
            </div>
          </section>

          {/* ---- what this group always argues about ---- */}
          {recap.sorestCategory && (
            <section
              className="mp-rise rounded-[22px] border border-coral/25 bg-coral/5 p-5"
              style={{ animationDelay: '120ms' }}
            >
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-coral">
                What you always argue about
              </p>
              <p className="mt-2 font-display text-[26px] font-semibold leading-none">
                {recap.sorestCategory.label}
              </p>
              <p className="mt-2 text-[12px] leading-snug text-muted">
                {formatScore(recap.sorestCategory.meanGap)} points between your highest and lowest
                score, night after night, across {recap.sorestCategory.nights} rounds.
              </p>
            </section>
          )}

          {/* ---- who you agree with ---- */}
          {twins?.twin && memberById(twins.twin.memberId) && (
            <section className="mp-rise" style={{ animationDelay: '180ms' }}>
              <PairCard
                heading="Your taste twin"
                member={memberById(twins.twin.memberId)!}
                agreement={twins.twin.agreement}
                members={members}
              />
            </section>
          )}
          {twins?.foil && memberById(twins.foil.memberId) && (
            <section className="mp-rise" style={{ animationDelay: '220ms' }}>
              <PairCard
                heading="Your foil"
                member={memberById(twins.foil.memberId)!}
                agreement={twins.foil.agreement}
                members={members}
              />
            </section>
          )}
          {twins && !twins.twin && (
            <p className="px-1 text-[12px] leading-snug text-muted">
              Nobody has locked in alongside you for {MIN_NIGHTS_FOR_A_CLAIM} nights yet, so there is
              no honest twin to name.
            </p>
          )}

          {/* ---- the run itself, newest first ---- */}
          {nights && nights.length > 0 && (
            <section className="mp-rise" style={{ animationDelay: '260ms' }}>
              <p className="mb-2 px-1 font-mono text-[9px] uppercase tracking-[0.16em] text-muted">
                Every night
              </p>
              <ul className="overflow-hidden rounded-2xl border border-line/60">
                {nights.map((n, i) => (
                  <li key={n.sessionId}>
                    <button
                      type="button"
                      onClick={() => onOpenSession(n.sessionId)}
                      className={`flex w-full items-center gap-3 bg-surface-2/40 px-3 py-2.5 text-left transition-colors active:bg-surface-2 ${
                        i > 0 ? 'border-t border-line/40' : ''
                      }`}
                    >
                      {n.posterPath ? (
                        <img
                          src={posterUrl(n.posterPath, 'w92')}
                          alt=""
                          className="h-10 w-7 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="grid h-10 w-7 shrink-0 place-items-center rounded-md bg-line font-display text-[12px] font-semibold text-bg"
                        >
                          {n.titleName.charAt(0)}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {n.titleName}
                      </span>
                      <span className="tabular shrink-0 font-mono text-[11px] text-muted">
                        {n.cards.filter((c) => c.locked).length} scored
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
