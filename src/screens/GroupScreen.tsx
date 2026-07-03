import { CATEGORY_LABELS, CATEGORY_IDS } from '../lib/scoring'
import {
  sampleWeights,
  sampleMembers,
  memberColor,
  CURRENT_MEMBER_ID,
} from '../lib/fixtures'

// Read-only group view: who's in, and the shared rubric — the group's
// definition of "a good movie". Editing weights (owner-only) arrives with
// Supabase; static fixtures until then.

export function GroupScreen() {
  const weightTotal = CATEGORY_IDS.reduce((sum, id) => sum + sampleWeights[id], 0)
  const maxWeight = Math.max(...CATEGORY_IDS.map((id) => sampleWeights[id]))

  return (
    <>
      {/* ---- Members ---- */}
      <section className="mp-rise">
        <p className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
          Members
        </p>
        <div className="mp-card rounded-[26px] px-4">
          <ul>
            {sampleMembers.map((m, i) => {
              const isYou = m.id === CURRENT_MEMBER_ID
              return (
                <li
                  key={m.id}
                  className={`flex items-center gap-3 py-3.5 ${i > 0 ? 'border-t border-line/50' : ''}`}
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full font-mono text-[13px] font-bold text-bg"
                    style={{ backgroundColor: memberColor(m.id) }}
                  >
                    {m.name.charAt(0)}
                  </span>
                  <span className="flex-1 text-[14px] font-medium">
                    {m.name}
                    {isYou && <span className="ml-1.5 text-muted">(you)</span>}
                  </span>
                  {isYou && (
                    <span className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted">
                      Owner
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      </section>

      {/* ---- The shared rubric ---- */}
      <section className="mp-rise mt-7" style={{ animationDelay: '80ms' }}>
        <div className="mb-3 flex items-baseline justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Group rubric
          </p>
          <p className="font-mono text-[10px] text-muted">what counts, and how much</p>
        </div>
        <div className="mp-card rounded-[26px] px-4">
          <ul>
            {CATEGORY_IDS.map((id, i) => {
              const weightPct = Math.round((sampleWeights[id] / weightTotal) * 100)
              return (
                <li
                  key={id}
                  className={`flex items-center gap-3 py-3.5 ${i > 0 ? 'border-t border-line/50' : ''}`}
                >
                  <span className="w-[104px] shrink-0 text-[13px] font-medium">
                    {CATEGORY_LABELS[id]}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(sampleWeights[id] / maxWeight) * 100}%`,
                        backgroundImage: 'linear-gradient(90deg, #3FA9A2, #6FE3DB)',
                      }}
                    />
                  </div>
                  <span className="tabular w-9 shrink-0 text-right font-mono text-[13px] text-muted">
                    {weightPct}%
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
        <p className="mt-3 px-2 text-[12px] leading-snug text-muted">
          The rubric is the group's shared definition of a good movie — every member's scores are
          weighted by it. Weight editing arrives with accounts.
        </p>
      </section>
    </>
  )
}
