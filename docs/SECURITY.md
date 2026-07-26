# Security posture

Last audited: **2026-07-27** (hosted project `lvmcwvhlfijvegxbqipc`).

This is the operator's document: what protects user data, what was found open
and fixed, and what is still outstanding before the App Store. It is written
against the **hosted** project, not the local stack — the two differ in exactly
the ways that matter (see "Default privileges" below).

---

## The model in one paragraph

The client only ever holds the **anon key** plus the signed-in user's JWT.
Every table has RLS on, and policies are **SELECT-only**: with a handful of
self-scoped exceptions, no client role can INSERT, UPDATE or DELETE directly.
Writes go through `SECURITY DEFINER` RPCs that check authorisation themselves.
That is why the hosted advisor reports ~61 "signed-in users can execute a
SECURITY DEFINER function" warnings — that is the architecture working, not a
finding.

The one rule that must never be wrong: **blind scores are enforced server-side**.
A member reads another member's scores only when the session is `revealed` AND
their own scorecard is locked. UI hiding is never the boundary. Two independent
suites pin it (`supabase/tests/`, pgTAP; `scripts/verify-rls/`, a portable
Postgres twin) and both must pass before any schema change ships.

---

## Audit of 2026-07-27 — what was open

Found by enumerating actual privileges on hosted (`has_table_privilege`,
`pg_policies`) rather than by reading migrations. All four are fixed in
`supabase/migrations/20260727120000_launch_hardening.sql` and pinned by
`supabase/tests/hardening_test.sql` (20 assertions) and
`scripts/verify-rls/98c-hardening-test.sql` (9).

| # | Surface | What was possible | Severity |
|---|---|---|---|
| 1 | `titles` INSERT policy was `with check (true)` | Any signed-in user could `POST /rest/v1/titles` with an arbitrary `name` and `poster_path`. Titles are globally readable and appear inside other people's groups, playlists and polls — a route to put text in front of strangers, which is what App Store guideline 1.2 polices. | High |
| 2 | `titles` UPDATE granted to `authenticated` on every column | Inert, because no UPDATE policy existed. The grant already said yes; only an absence said no. Add a policy later and it opens silently. | Medium (latent) |
| 3 | `profiles` SELECT `using (true)` with a table-level grant | Every signed-in user could read every profile row including `banned` — an oracle for who has been sanctioned — and `created_at`. | Medium |
| 4 | No write ceiling anywhere | One account could flood messages, DM requests, comments or titles as fast as the network allowed, and hammer the TMDB proxy (which spends **our** API key). | Medium, rising with scale |

### How they were closed

1. **`titles` takes no direct client writes.** INSERT/UPDATE revoked, the open
   policy dropped. The only writer is `ensure_title`, which validates media
   type, name length, control characters, year range, and poster-path *shape*
   (`^/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp|svg)$` — it is interpolated straight
   into an `image.tmdb.org` URL, so a scheme or a `..` cannot be allowed). A
   **manual** title is free text a member typed, so it goes through the same
   wordlist that gates comments. The RPC is idempotent on
   `(tmdb_id, media_type)`, so racing callers share a row.
2. **Reading `titles` stays open** — a title is shared reference data and every
   group needs rows other groups created.
3. **`profiles` keeps a permissive row policy** (five PostgREST embeds depend
   on it: message senders, comment authors, member lists, playlist owners,
   friends) but the table-level SELECT grant is gone and only
   `(id, display_name, avatar_key, taste_mode, accepted_terms_at)` are
   re-granted. `banned` is read inside definer RPCs, which are unaffected.
4. **Rate limits.** `rate_limits` is a definer-only ledger (RLS on, no
   policies, no grants — same posture as `banned_terms`).
   `consume_rate_limit(bucket, limit, window_seconds)` counts a fixed window
   per user per bucket. Enforced by BEFORE INSERT triggers on `messages`,
   `title_comments` and `conversations`, **not** by re-issuing the RPCs: a
   trigger cannot drift from a body it does not live in.

   | Bucket | Limit | Notes |
   |---|---|---|
   | `message_send` | 60 / min | excludes `'system'` messages, or leaving a chat could fail |
   | `comment_post` | 20 / min | |
   | `dm_start` | 20 / hour | the stranger-spam vector |
   | `title_write` | 60 / min | inside `ensure_title` |
   | `tmdb_proxy` | 120 / min | in the edge function, charged to the caller's JWT |

   The edge limiter **fails open**: if the limiter is unreachable, browsing
   still works. A rate limiter that takes the app down when it breaks is worse
   than the abuse it prevents.

---

## Second pass, same day — moderation, and a class the first pass missed

Fixed in `20260727180000_moderation.sql` and `20260727190000_anon_write_revoke.
sql`, pinned by `supabase/tests/moderation_test.sql` (32 assertions) and
`scripts/verify-rls/98d-moderation-test.sql` (10).

**Moderation tooling** (the blocker that used to head the list below) now
ships: a `is_moderator` role that no client can read or write, resolution state
on both report tables, an append-only `moderation_actions` trail with no UPDATE
or DELETE granted to anyone, four role-checked definer RPCs, and a screen. See
CLAUDE.md for the design. The relevant security property: `moderation_queue`
reads other people's private messages, so it is scoped to content that has
ACTUALLY been reported — that scope is the entire justification for the
function existing, and it must never become a way to browse conversations.

| # | Surface | What was possible | Severity |
|---|---|---|---|
| 5 | `anon` held INSERT/UPDATE/DELETE/TRUNCATE on **all 21 public tables** — including `profiles.banned` and the new `profiles.is_moderator` | Nothing, today. Not one policy on any of those tables names `anon`, so RLS denied every row; an anon-key PATCH setting `is_moderator` and an anon-key profile INSERT both returned 401. This is finding #2's shape at 21× the scale: the grant already said yes, and only an absence said no. One permissive policy added later opens it with no other warning. | Medium (latent) |

Closed by revoking every write privilege from `anon` on every public table,
plus `alter default privileges ... revoke ... from anon` so new tables inherit
the posture instead of relying on someone remembering. SELECT is deliberately
untouched: anon reads nothing today, but revoking reads is a behavioural change
and revoking writes it never used is not.

**Why the first pass missed it, which is the part worth keeping.**
`hardening_test.sql` asserts `not has_table_privilege('anon','public.titles',
'INSERT')` and it PASSED — because a local `db reset` never issues anon those
grants in the first place. The suite was describing a posture that only existed
on this machine. `20-grants.sql` now simulates the anon grants (and re-applies
messaging's own anon revokes, which is what kept its "anon has no read"
assertion honest), and **both suites assert the class** — "no public table
grants anon a write" — rather than one table at a time. A per-table assertion
goes stale the moment someone adds a table; a class assertion cannot.

---

## Running moderation

The queue lives at **Profile → gear → Reports** (or `/moderation` directly).
It only appears for moderators, and every RPC behind it re-checks the role, so
the hidden link is a courtesy rather than the control.

**Promoting or demoting a moderator is deliberately not possible from inside
the app.** There is no RPC for it, `is_moderator` is neither readable nor
writable by any client, and that is the point: an app that can promote its own
moderators has no privilege boundary. Do it in the Supabase SQL editor:

```sql
update public.profiles set is_moderator = true
 where id = (select id from auth.users where email = 'them@example.com');
```

Swap `true` for `false` to demote. To see who currently holds it:

```sql
select p.display_name, u.email from public.profiles p
  join auth.users u on u.id = p.id where p.is_moderator;
```

Current moderators: **Alex** (`alexanderlukasland@gmail.com`), set 2026-07-27.

What the three actions do:

| Action | Content | Author | Reversible from the app? |
|---|---|---|---|
| **Dismiss** | stays; an auto-hidden comment is **un-hidden** | untouched | n/a |
| **Remove** | soft-deleted, invisible to everyone | untouched | no — needs SQL |
| **Ban author** | removed | `profiles.banned = true` | yes — **Lift ban** in Recent actions |

Writing that table is what caught a dead end worth recording. Banning happens
two ways and they record differently: from the queue, `resolve_report` stores
the CONTENT as `target_id` with `target_kind` `'comment'`/`'message'`; from the
log, `set_user_banned` stores the PERSON with `target_kind` `'user'`. The
screen's "Lift ban" was keyed on `'user'`, so it never appeared for the common
path — and since that button was the only caller of `set_user_banned`, the app
could ban but never unban. Fixed in `20260727200000` by returning
`target_user_id` from `moderation_log` (it was always recorded, just never
projected) and keying the control on the affected person instead.

Three distinct reporters auto-hide a comment before anyone looks at it, which
is why **Dismiss un-hides**: without that, a brigade of three bad-faith reports
would be a permanent mute no moderator could undo.

The queue is ordered **oldest first** and marks anything past 24 hours as
overdue, because that is the window App Store guideline 1.2 asks you to attest
to. Everything you do is written to `moderation_actions`, which grants no
UPDATE or DELETE to anyone — including you.

A moderator cannot ban themselves (`set_user_banned` refuses it), and nothing
stops a second moderator from acting on the first. There is no super-admin
tier; if that is ever needed, it is a schema change, not a setting.

---

## Traps worth remembering

- **A column revoke is a no-op while a table-level grant stands.** Revoking
  `select (banned)` changed nothing until `revoke select on profiles` ran
  first. Verified by probe, not assumed.
- **Default privileges differ between a local `db reset` and a hosted
  `db push`.** Never let "no policy" be the only thing standing in the way of
  a table — revoke the grant explicitly too. (`rate_limits` returned zero rows
  under RLS while still *holding* a default SELECT grant.)
- **The twin re-grants after migrations.** `scripts/verify-rls/20-grants.sql`
  simulates the platform's blanket grants and then re-applies every deliberate
  revoke. A new revoke that is not mirrored there means the twin tests an
  ungated schema and passes anyway.
- **A green assertion about `anon` may be describing your laptop.** The twin
  granted `anon` nothing at all until 2026-07-27, so every "anon cannot X"
  check passed vacuously while hosted said otherwise. If a suite asserts an
  absence, make sure something first creates the presence — and prove the
  assertion can fail before trusting it.
- **Assert the class, not the instance.** "No public table grants anon a write"
  survives a new table; "anon cannot INSERT into `titles`" does not.
- **`SET LOCAL` outside a transaction is a no-op**, so a privilege probe
  written without `begin; … rollback;` silently runs as superuser and proves
  nothing.

---

## Verifying the posture

```bash
npx supabase test db
```

```bash
powershell -File scripts\verify-rls.ps1
```

```bash
powershell -File scripts\check-grants.ps1
```

After deploying any function migration, probe hosted directly — the suites
cannot catch a missing `anon` revoke. An anon-key `POST /rest/v1/rpc/<fn>` must
return 401, with `GET /rest/v1/titles` → 200 and a nonexistent RPC → 404 to
prove the probe distinguishes outcomes.

Current hosted advisor state: **0 ERROR**, 63 WARN, 4 INFO — 61 WARNs are the
definer-RPC architecture (the moderation pass added five), plus `pg_net` living
in `public` and the leaked-password toggle below. The 4 INFO
`rls_enabled_no_policy` notices are the definer-only tables
(`moderation_actions`, `rate_limits`, `banned_terms`, `notification_config`):
no policy is the intent there, not an oversight.

---

## Outstanding before the App Store

Ordered by what blocks a submission.

1. **Compliance artifacts.** Privacy policy URL and support URL are required
   fields; the App Privacy questionnaire needs every collected data type mapped
   to the table that holds it. Account deletion (`delete_my_account`) and the
   `ITSAppUsesNonExemptEncryption` declaration already ship.
2. **Leaked-password protection** — Dashboard → Authentication. **Pro plan
   only**: the Management API returns 402 on free ("available on Pro Plans and
   up"). Not a missed toggle — it is gated until the project is upgraded.
3. **APNs secrets** (`PUSH_SHARED_SECRET`, `APNS_AUTH_KEY`, `APNS_KEY_ID`,
   `APPLE_TEAM_ID`) are still unset, so pushes do not deliver, and the App ID
   needs the Push Notifications capability. **`docs/PUSH.md` walks it through**
   — roughly 20 minutes, no code. Note `notification_config` on hosted is
   already seeded, so `PUSH_SHARED_SECRET` must be *copied from the database*,
   not invented: if the two drift the function 401s its own database and
   nothing is ever delivered.
4. **`pg_net` in `public`** — a persistent advisor WARN. Low risk (it is
   service-role reachable only), but moving it to `extensions` clears it.
5. **Backups and restore.** Supabase takes daily backups on paid plans; nobody
   has yet tested a restore. An untested backup is a hope, not a control.

## Reporting a vulnerability

Email the address published on the App Store listing. Please include the
project ref, the request you sent, and what came back. There is no bounty
programme.

## Local vs hosted: the divergence that keeps biting

`supabase/config.toml` configures the **local stack only**. Hosted keeps its
own settings with its own defaults, so anything auth-shaped can work perfectly
on your machine and behave differently in production — silently, looking like
an app bug.

It has happened three times:

| Setting | Local | Hosted was | Symptom |
| --- | --- | --- | --- |
| email templates | wired from `supabase/templates/` | Supabase's stock link-based ones | every code-based flow broken, for everyone |
| `site_url` | `127.0.0.1:3000` | `localhost:3000` | reset links landed on a dead port |
| `otp_length` | 6 | **8** | the app's 6-digit input could never accept the emailed code |

Run this before trusting hosted auth, and after any change to `config.toml`:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/check-hosted-auth.mjs
```

It diffs the settings that must match, asserts every template renders
`{{ .Token }}` rather than a link, and prints the ones that differ on purpose
(`site_url`, redirect list, SMTP host).

**Templates are locked on free tier without custom SMTP** — the Management API
refuses them outright. Resend is configured, which is what unlocked them.
