# Mash Potato

A mobile movie/TV review app for groups. A group sets a shared **weighted
rubric** — how much Story, Acting, Cinematography, Pacing, and Score & Sound
each count — every member rates those categories for a title, and the app
**mashes** everyone's weighted scores into one group **"Mashed"** score.

The signature feature is **The Reveal**: everyone scores blind, then all
scores drop at once and the app headlines where the group agreed vs. clashed.

## What makes it different

- Weights live on the **group** — a group is a shared definition of "a good movie".
- One **Mashed** consensus score per title (always teal).
- The blind **Reveal**.
- Disagreement as the headline: most contested + most united category, plus
  the per-category outlier.

## Stack

React + TypeScript + Vite · Tailwind v4 (CSS-first `@theme`) · Capacitor
(Android + iOS) · Supabase (Auth + Postgres + Realtime + RLS) · Firebase Cloud
Messaging · TMDB. Mobile-first, single ~480px-max column.

## Getting started

```sh
npm install
npm run dev        # Vite on http://localhost:5180
npm test           # Vitest (scoring core + score ramp)
npm run build      # type-check + production build
npm run lint       # oxlint
```

Copy `.env.example` to `.env` for Supabase credentials (only the anon key —
never the service_role key or the TMDB key; those go through Edge Functions).

## Project layout

- `src/lib/scoring.ts` — **all** scoring math, pure and unit-tested:
  member weighted = Σ(score×imp)/Σ(imp); Mashed = mean of locked members'
  weighted scores; contested/united categories; outlier.
- `src/lib/scoreColor.ts` — the 1→10 coral → gold → lime score ramp.
- `src/components/` — UI building blocks (Logo, ScoreRing, BottomNav).
- `supabase/migrations/` — schema + RLS as versioned SQL.
- `supabase/tests/blind_read_test.sql` — pgTAP proof of the blind rule.

## TMDB

Title search is proxied through the `tmdb-search` Edge Function — the TMDB
key lives in `supabase/functions/.env` locally (see `.env.example` there) or
`supabase secrets` when hosted, and never ships in the client. This product
uses the TMDB API but is not endorsed or certified by TMDB.

## Releasing

See [docs/RELEASING.md](docs/RELEASING.md) for the TestFlight path (hosted
Supabase → Apple Developer → Xcode upload) and the Play internal-testing
equivalent. `ios/` and `android/` are both generated and synced via
`npm run sync`.

## The one rule that must not be wrong

Blind scores are enforced **server-side** via Supabase RLS: a member can read
others' scores **only when the reveal session is `revealed`**. The UI hiding
anything is never the security boundary. See the policies on
`public.member_scores` in the initial migration.

With Docker installed, verify locally:

```sh
npx supabase start
npx supabase db reset   # apply migrations
npx supabase test db    # run the pgTAP blind-rule proof
```
