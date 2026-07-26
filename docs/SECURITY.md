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
That is why the hosted advisor reports ~56 "signed-in users can execute a
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

Current hosted advisor state: **0 ERROR**, 58 WARN — 56 are the definer-RPC
architecture, plus `pg_net` living in `public` and the leaked-password toggle
below.

---

## Outstanding before the App Store

Ordered by what blocks a submission.

1. **Moderation tooling — the real blocker.** Guideline 1.2 asks you to attest
   that you act on reports within 24 hours. Filtering (`banned_terms`),
   reporting and blocking all ship, but reports accumulate in tables and
   `profiles.banned` is dashboard-only, so triage means hand-writing SQL. You
   cannot honour a 24-hour SLA that way. Needs a report queue plus action RPCs
   with an audit trail.
2. **Compliance artifacts.** Privacy policy URL and support URL are required
   fields; the App Privacy questionnaire needs every collected data type mapped
   to the table that holds it. Account deletion (`delete_my_account`) and the
   `ITSAppUsesNonExemptEncryption` declaration already ship.
3. **Leaked-password protection** — one toggle, Dashboard → Authentication →
   Providers → Email. Supabase checks new passwords against HaveIBeenPwned.
   Not settable from the CLI or MCP.
4. **APNs secrets** (`PUSH_SHARED_SECRET`, `APNS_AUTH_KEY`, `APNS_KEY_ID`,
   `APPLE_TEAM_ID`) are still unset, so pushes do not deliver, and the App ID
   needs the Push Notifications capability.
5. **`pg_net` in `public`** — a persistent advisor WARN. Low risk (it is
   service-role reachable only), but moving it to `extensions` clears it.
6. **Backups and restore.** Supabase takes daily backups on paid plans; nobody
   has yet tested a restore. An untested backup is a hope, not a control.

## Reporting a vulnerability

Email the address published on the App Store listing. Please include the
project ref, the request you sent, and what came back. There is no bounty
programme.
