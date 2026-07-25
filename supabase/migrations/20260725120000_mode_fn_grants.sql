-- Grants repair: the mode aggregates are authenticated-only.
--
-- 20260718150000 revoked them with `revoke execute ... from public` and did
-- NOT name `anon`. Locally that was enough (the suites passed), but on the
-- hosted project anon carries its own execute grant, so both functions were
-- callable WITHOUT a session: verified live, title_mode_scores returned 200
-- for the anon key while every correctly-sealed function returned 401.
--
-- The house pattern (see 20260717200000_group_polls.sql) is
--   revoke all on function ... from public, anon;
--   grant execute on function ... to authenticated;
-- and it is what every function migration must use — default privileges
-- differ between a local `db reset` and a hosted `db push`, so relying on
-- them is what let this through.
--
-- Exposure was low (both are aggregate-only: a count and a mean, never
-- individual rows or user ids), but it violated the GRANTS LAW and left an
-- unauthenticated compute endpoint open.

revoke all on function public.title_mode_scores(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.title_mode_scores(uuid, jsonb, jsonb) to authenticated;

revoke all on function public.title_mode_histogram(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.title_mode_histogram(uuid, jsonb, jsonb, text) to authenticated;

-- Belt and braces on the trigger internal (already sealed, kept explicit so a
-- fresh environment cannot drift).
revoke all on function public.reseed_group_rubrics() from public, anon, authenticated;
