-- Personal "my list": per-user saved titles.
--
-- A private pointer into the shared public.titles cache — one row per (user,
-- title) a member has saved. Self-only in every direction: a member never sees
-- anyone else's list. This is an INDEPENDENT relation; it does not touch
-- public.member_scores, the reveal sessions, or the blind rule in any way.

create table public.saved_titles (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title_id   uuid not null references public.titles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, title_id)
);
create index saved_titles_title_id_idx on public.saved_titles (title_id);

alter table public.saved_titles enable row level security;

-- Self-only. No update policy: a save has nothing to mutate — unsave is a
-- delete, re-save is an insert.
create policy saved_select_self on public.saved_titles
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy saved_insert_self on public.saved_titles
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy saved_delete_self on public.saved_titles
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Baseline access for the PostgREST role; RLS above is the security boundary.
-- `anon` deliberately gets nothing, consistent with the rest of the schema.
grant select, insert, delete on public.saved_titles to authenticated;
