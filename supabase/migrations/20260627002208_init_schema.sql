-- Mash Potato — initial schema + Row-Level Security.
--
-- THE ONE RULE THAT MUST NOT BE WRONG: a member may read OTHERS' scores only
-- once the reveal session is 'revealed'. It is enforced here, server-side, by
-- the policies on public.member_scores — never by the UI.

-- =====================================================================  enums
create type public.category_id as enum
  ('story', 'acting', 'cinematography', 'pacing', 'score_sound');
create type public.reveal_state as enum ('blind', 'revealed');
create type public.media_type as enum ('movie', 'tv');
create type public.member_role as enum ('owner', 'member');

-- =====================================================================  tables

-- 1:1 with auth.users; holds the display name shown around the app.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  created_at timestamptz not null default now()
);

-- A group is a shared definition of "a good movie".
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  owner_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Membership (users <-> groups, many-to-many).
create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_id_idx on public.group_members (user_id);

-- The rubric: weights live on the GROUP (one row per category).
create table public.rubric_weights (
  group_id uuid not null references public.groups (id) on delete cascade,
  category public.category_id not null,
  weight integer not null default 20 check (weight between 0 and 1000),
  primary key (group_id, category)
);

-- Shared TMDB metadata cache.
create table public.titles (
  id uuid primary key default gen_random_uuid(),
  tmdb_id integer not null,
  media_type public.media_type not null,
  name text not null,
  year integer check (year between 1870 and 2200),
  poster_path text,
  created_at timestamptz not null default now(),
  unique (tmdb_id, media_type)
);

-- A group scoring a specific title. The Reveal lives on this row's `state`.
create table public.reveal_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title_id uuid not null references public.titles (id) on delete restrict,
  state public.reveal_state not null default 'blind',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  revealed_at timestamptz
);
create index reveal_sessions_group_id_idx on public.reveal_sessions (group_id);

-- One scorecard per member per session. This ROW is the unit the blind rule
-- guards: 5 category ratings (1..10) plus whether the member has locked in.
create table public.member_scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.reveal_sessions (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  story smallint not null check (story between 1 and 10),
  acting smallint not null check (acting between 1 and 10),
  cinematography smallint not null check (cinematography between 1 and 10),
  pacing smallint not null check (pacing between 1 and 10),
  score_sound smallint not null check (score_sound between 1 and 10),
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, member_id)
);
create index member_scores_session_id_idx on public.member_scores (session_id);
create index member_scores_member_id_idx on public.member_scores (member_id);

-- =====================================================================  helpers
-- SECURITY DEFINER so membership lookups bypass RLS — this is what prevents
-- policies on group_members/groups from recursing into themselves.

create or replace function public.is_group_member(p_group_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.groups g
    where g.id = p_group_id and g.owner_id = (select auth.uid())
  );
$$;

create or replace function public.session_group_id(p_session_id uuid)
returns uuid language sql security definer set search_path = '' stable as $$
  select group_id from public.reveal_sessions where id = p_session_id;
$$;

create or replace function public.session_is_revealed(p_session_id uuid)
returns boolean language sql security definer set search_path = '' stable as $$
  select exists (
    select 1 from public.reveal_sessions
    where id = p_session_id and state = 'revealed'
  );
$$;

-- =====================================================================  triggers

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger member_scores_touch_updated_at
  before update on public.member_scores
  for each row execute function public.touch_updated_at();

-- New auth user -> profile row.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Member'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- New group -> add the owner as a member and seed equal rubric weights.
create or replace function public.handle_new_group()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'owner');

  insert into public.rubric_weights (group_id, category, weight) values
    (new.id, 'story', 20),
    (new.id, 'acting', 20),
    (new.id, 'cinematography', 20),
    (new.id, 'pacing', 20),
    (new.id, 'score_sound', 20);
  return new;
end;
$$;

create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_new_group();

-- A revealed session can never be un-revealed (one-way; protects the rule).
create or replace function public.prevent_unreveal()
returns trigger language plpgsql as $$
begin
  if old.state = 'revealed' and new.state <> 'revealed' then
    raise exception 'a revealed session cannot be un-revealed';
  end if;
  return new;
end;
$$;

create trigger reveal_sessions_prevent_unreveal
  before update on public.reveal_sessions
  for each row execute function public.prevent_unreveal();

-- Reveal API: flip a blind session to revealed (group owner or session creator).
create or replace function public.reveal_session(p_session_id uuid)
returns public.reveal_sessions
language plpgsql security definer set search_path = '' as $$
declare
  v_session public.reveal_sessions;
begin
  if not (
    public.is_group_owner(public.session_group_id(p_session_id))
    or exists (
      select 1 from public.reveal_sessions
      where id = p_session_id and created_by = (select auth.uid())
    )
  ) then
    raise exception 'not authorised to reveal this session';
  end if;

  update public.reveal_sessions
    set state = 'revealed', revealed_at = now()
    where id = p_session_id and state = 'blind'
    returning * into v_session;

  return v_session;
end;
$$;

revoke execute on function public.reveal_session(uuid) from public;
grant execute on function public.reveal_session(uuid) to authenticated;

-- =====================================================================  RLS
alter table public.profiles        enable row level security;
alter table public.groups          enable row level security;
alter table public.group_members   enable row level security;
alter table public.rubric_weights  enable row level security;
alter table public.titles          enable row level security;
alter table public.reveal_sessions enable row level security;
alter table public.member_scores   enable row level security;

-- profiles ------------------------------------------------------------------
create policy profiles_select_authenticated on public.profiles
  for select to authenticated using (true);
create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- groups --------------------------------------------------------------------
create policy groups_select_member on public.groups
  for select to authenticated
  using (public.is_group_member(id) or owner_id = (select auth.uid()));
create policy groups_insert_owner on public.groups
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy groups_update_owner on public.groups
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy groups_delete_owner on public.groups
  for delete to authenticated using (owner_id = (select auth.uid()));

-- group_members -------------------------------------------------------------
create policy group_members_select_member on public.group_members
  for select to authenticated using (public.is_group_member(group_id));
create policy group_members_insert_owner on public.group_members
  for insert to authenticated with check (public.is_group_owner(group_id));
create policy group_members_delete_owner_or_self on public.group_members
  for delete to authenticated
  using (public.is_group_owner(group_id) or user_id = (select auth.uid()));

-- rubric_weights ------------------------------------------------------------
create policy rubric_select_member on public.rubric_weights
  for select to authenticated using (public.is_group_member(group_id));
create policy rubric_write_owner on public.rubric_weights
  for all to authenticated
  using (public.is_group_owner(group_id)) with check (public.is_group_owner(group_id));

-- titles (shared cache) -----------------------------------------------------
create policy titles_select_authenticated on public.titles
  for select to authenticated using (true);
create policy titles_insert_authenticated on public.titles
  for insert to authenticated with check (true);

-- reveal_sessions -----------------------------------------------------------
create policy sessions_select_member on public.reveal_sessions
  for select to authenticated using (public.is_group_member(group_id));
create policy sessions_insert_member on public.reveal_sessions
  for insert to authenticated
  with check (public.is_group_member(group_id) and created_by = (select auth.uid()));
create policy sessions_update_owner_or_creator on public.reveal_sessions
  for update to authenticated
  using (public.is_group_owner(group_id) or created_by = (select auth.uid()))
  with check (public.is_group_owner(group_id) or created_by = (select auth.uid()));

-- =====================================================================  grants
-- Baseline access for the PostgREST role. RLS (below/above) is the security
-- boundary — these grants just let `authenticated` reach the tables at all.
-- `anon` deliberately gets NOTHING: every feature of this app requires login.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;

-- member_scores — THE BLIND RULE --------------------------------------------
-- (1) Always read your OWN scorecard.
create policy scores_select_own on public.member_scores
  for select to authenticated
  using (member_id = (select auth.uid()));

-- (2) Read OTHERS' scorecards ONLY once the session is revealed, and only if
--     you belong to the session's group. This is the rule that must not be wrong.
create policy scores_select_revealed on public.member_scores
  for select to authenticated
  using (
    member_id <> (select auth.uid())
    and public.session_is_revealed(session_id)
    and public.is_group_member(public.session_group_id(session_id))
  );

-- (3) Create only your OWN scorecard, in a group you belong to.
create policy scores_insert_own on public.member_scores
  for insert to authenticated
  with check (
    member_id = (select auth.uid())
    and public.is_group_member(public.session_group_id(session_id))
  );

-- (4) Edit only your OWN scorecard, and only while the session is still blind.
create policy scores_update_own_while_blind on public.member_scores
  for update to authenticated
  using (
    member_id = (select auth.uid())
    and not public.session_is_revealed(session_id)
  )
  with check (member_id = (select auth.uid()));
