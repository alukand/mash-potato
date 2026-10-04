import { genreDef } from '../lib/genres'
import type { GenreKey } from '../lib/genres'

// The once-per-genre question (lib/genres.ts needsGenrePrompt): keep the
// genre's standard, or make your own rubric for it. Solo, your new rubric
// applies to the rating in front of you. In a round, the round keeps the
// weights it started with (DESIGN.md "Rubric cadence"), so yours counts from
// your next round of that genre.
export function GenrePrompt({
  genre,
  where,
  busy = false,
  onKeepStandard,
  onMakeOwn,
}: {
  genre: GenreKey
  where: 'solo' | 'round'
  busy?: boolean
  onKeepStandard: () => void
  onMakeOwn: () => void
}) {
  const g = genreDef(genre)
  return (
    <div role="status" className="rounded-2xl border border-gold/30 bg-gold/5 p-4">
      <p className="text-[13px] font-semibold leading-snug text-gold">
        {where === 'solo' ? `Your first ${g.label} rating` : `Your first ${g.label} round`}
      </p>
      <p className="mt-1.5 text-[13px] leading-snug text-muted">
        {where === 'solo'
          ? `The standard ${g.label} card ${g.change}. Rate with it, or make your own ${g.label} rubric: it is used for every ${g.label} title you rate, alone and in your groups.`
          : `This round uses the standard ${g.label} rubric for you: it ${g.change}. Make your own and it counts from your next ${g.label} round, in all your groups.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onKeepStandard}
          className="min-h-10 flex-1 rounded-full border border-line px-4 text-[12px] font-semibold text-muted transition-colors hover:text-text active:bg-surface-2 disabled:opacity-60"
        >
          {where === 'solo' ? 'Use the standard' : 'Keep the standard'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onMakeOwn}
          className="min-h-10 flex-1 rounded-full border border-gold/50 bg-gold/10 px-4 text-[12px] font-semibold text-gold transition-colors active:bg-gold/20 disabled:opacity-60"
        >
          Make my {g.label} rubric
        </button>
      </div>
    </div>
  )
}
