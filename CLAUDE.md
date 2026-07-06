# Mash Potato — project instructions

Mobile movie/TV review app: a GROUP sets a shared weighted rubric (Story,
Acting, Cinematography, Pacing, Score & Sound), members rate each category
blind, the app mashes weighted scores into one group "Mashed" score, then THE
REVEAL drops everyone's scores at once and headlines agreement vs. clash.

## Locked — do not redesign or rename

- The moat: weights live on the GROUP; one Mashed score per title (always
  teal, labelled "Mashed"); the blind Reveal; disagreement-as-headline
  (most contested + most united category, per-category outlier).
- Stack: React + TS + Vite, Tailwind v4 (CSS-first `@theme` in
  `src/index.css` — no tailwind.config.js), Capacitor (android/ + ios/
  generated), Supabase (Auth + Postgres + Realtime + RLS), FCM (future),
  TMDB. Mobile-first single ~480px column. Ask before adding dependencies
  (including a router — deliberately absent so far).
- Design tokens + fonts (Fraunces / Hanken Grotesk / Space Mono) live in
  `src/index.css` and `index.html`. Score ramp 1→10 coral→gold→lime is
  `src/lib/scoreColor.ts`.

## THE ONE RULE THAT MUST NOT BE WRONG

Blind scores are enforced SERVER-SIDE by RLS on `public.member_scores`: a
member reads others' scores ONLY when the session is `revealed`. UI hiding is
never the boundary. Any schema change touching this needs both test suites
updated and passing:

- `npx supabase test db` — pgTAP, `supabase/tests/blind_read_test.sql`
- `powershell -File scripts\verify-rls.ps1` — portable-Postgres twin
  (see `scripts/verify-rls/README.md`)

Never put the TMDB key or service_role key in client code — TMDB goes through
the `tmdb-search` Edge Function (`supabase/functions/`; local secret in
`supabase/functions/.env`, hosted via `supabase secrets set`). The anon key is
fine client-side.

## Commands

- `npm run dev` — Vite on port 5180 (fixed; 5173/5174 belong to another project)
- `npm test` / `npm run lint` / `npm run build` (tsc -b + vite)
- `npm run sync` / `sync:ios` / `sync:android` — build + copy into native shells
- `npx supabase start|stop|db reset|test db` — local stack (Docker)
- Regenerate DB types (PowerShell — cmd wrapper avoids UTF-16 mangling):
  `cmd /c "npx supabase gen types typescript --local > src\lib\database.types.ts"`

## Architecture map

- `src/lib/scoring.ts` — ALL scoring math, pure, unit-tested. Fixed 5
  camelCase category ids (`scoreSound` ↔ DB `score_sound` via
  `src/lib/mapping.ts`).
- `src/lib/api.ts` — every Supabase call; screens never import the client.
- `src/screens/` — Auth, CreateGroup, Home (latest session, realtime reveal),
  Rate (TMDB search → blind scoring → lock → reveal), Group (members +
  owner-editable rubric).
- `supabase/migrations/` — schema + RLS as code (grants included — do not
  rely on platform default privileges).

## Current state (2026-07-05)

- M0–M5 committed (scaffold → scoring core → schema/RLS → screens → live
  sessions + realtime reveal, all verified). M6 (TMDB search + ios/ platform
  + `docs/RELEASING.md`) built & verified locally, uncommitted alongside
  `.mcp.json` and `.agents/`.
- Hosted Supabase project ref: `lvmcwvhlfijvegxbqipc` (MCP config in
  `.mcp.json`). Remaining for TestFlight — `docs/RELEASING.md` Part 1 on the
  hosted project (apply migrations, set `TMDB_API_KEY` secret, deploy
  `tmdb-search`, fill `.env.production`), then Apple Developer + Mac/Codemagic
  upload (Parts 2–3).

## Windows gotchas (this machine)

- Docker/Supabase CLI need a PATH refresh in each new shell:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
- `npx supabase functions serve` crashes (ENAMETOOLONG) — restart the stack
  instead; the built-in runtime picks up functions + `functions/.env`.
- After `supabase db reset`, the browser keeps a stale JWT — use the app's
  sign-out to recover.
- Repo must stay OUTSIDE OneDrive (Desktop is OneDrive-synced here).
