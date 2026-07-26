# Turning push notifications on

Everything in this repo and in the database is already done. What is missing is
an **APNs signing key from Apple** and **four secrets on the Supabase Edge
Function**. Until those exist the function refuses to run, on purpose — it
returns `push not configured` rather than half-sending.

Budget about 20 minutes. You need an Apple Developer account and access to the
Supabase dashboard. Nothing here touches code.

---

## What is already in place — do not redo these

| Piece | State |
|---|---|
| `device_tokens` table, RLS, `register_device_token` | shipped |
| Three triggers (group added / round started / member locked) + `new_message` | shipped |
| `push_notify` → pg_net → the Edge Function | shipped |
| `send-push` Edge Function (APNs HTTP/2, ES256 provider JWT) | deployed |
| `notification_config` row on hosted | **seeded** — endpoint, secret and bearer all set |
| iOS entitlement `aps-environment = production` | in the repo |
| `AppDelegate` token registration, `src/lib/push.ts`, tap routing | shipped |
| Codemagic signing via the App Store Connect integration | configured |

The one to notice is `notification_config`: the **database half of the shared
secret already has a value**. Step 2.1 is copying that value, not inventing one.

---

## Part 1 — Apple Developer portal

Everything here is at <https://developer.apple.com/account/resources>.

### 1.1 Add the Push Notifications capability to the App ID

1. **Identifiers** → click **`com.mashpotato.app`**.
2. Scroll the capability list to **Push Notifications** and tick it.
3. **Save**. Confirm the dialog that warns about regenerating profiles.

> Changing an App ID's capabilities **invalidates existing provisioning
> profiles**. Codemagic's App Store Connect integration creates profiles per
> build, so it normally picks up a fresh one by itself. If a build later fails
> to sign, or the app installs but never receives a token, delete the stale
> profile under **Profiles** and let the next build recreate it. This is the
> most common reason push "silently does nothing" after everything else is
> correct.

### 1.2 Create an APNs Auth Key

1. **Keys** → the **+** button.
2. **Key Name**: something you will recognise in two years —
   `Mash Potato APNs` is fine.
3. Tick **Apple Push Notifications service (APNs)**.
4. **Continue** → **Register** → **Download**.

You get `AuthKey_XXXXXXXXXX.p8`.

> **It downloads exactly once.** Apple will not give it to you again. Lose it
> and you revoke the key and make a new one. Put it somewhere durable (a
> password manager works well) and **not in this repo** — `.p8` is a private
> key, and the repo is on GitHub.

An APNs auth key is not per-app: one key covers every app on the account and
both the sandbox and production APNs hosts. Apple caps you at **two** keys, so
do not make a fresh one per project.

### 1.3 Collect the two ten-character ids

- **Key ID** — the 10 characters in the filename (`AuthKey_ABC123DEF4.p8` →
  `ABC123DEF4`), also shown on the key's page.
- **Team ID** — top right of the developer portal, or **Membership details**.
  Also 10 characters. It is *not* the same as the Key ID.

---

## Part 2 — Supabase secrets

Dashboard → your project → **Edge Functions** → **Secrets**
(<https://supabase.com/dashboard/project/lvmcwvhlfijvegxbqipc/settings/functions>).

### 2.1 Read the existing shared secret

The database already holds one, and the function's copy has to match it
exactly. In the **SQL Editor**:

```sql
select secret from public.notification_config;
```

Copy that value. (You may instead rotate it — set a new value in *both* places
in the same sitting. What must never happen is the two drifting apart: the
function will answer 401 to its own database and no notification will ever
arrive.)

### 2.2 Add four secrets

| Name | Value |
|---|---|
| `PUSH_SHARED_SECRET` | the value from 2.1, character for character |
| `APNS_AUTH_KEY` | the **entire contents** of the `.p8` file |
| `APNS_KEY_ID` | the 10-char Key ID from 1.3 |
| `APPLE_TEAM_ID` | the 10-char Team ID from 1.3 |

On `APNS_AUTH_KEY`: open the `.p8` in a text editor and paste **everything**,
including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`
lines and the line breaks. The function strips them itself
(`supabase/functions/send-push/index.ts`, the `.replace(/-----[^-]+-----/g,
'')` line), so you do not need to flatten or base64 it. Pasting the bare middle
also works; pasting a *path* to the file does not.

**Do not set `APNS_TOPIC` or `APNS_HOST`.** Their defaults are already right:
the topic defaults to `com.mashpotato.app` (the bundle id) and the host to
`https://api.push.apple.com` (production), which is what the
`aps-environment = production` entitlement issues tokens for. See
"Sandbox vs production" below before you change either.

---

## Part 3 — Build and verify

### 3.1 Ship a build

Run the `ios-testflight` workflow in Codemagic (see `docs/TESTFLIGHT.md`) and
install it from TestFlight. **None of this session's work is on your phone
yet**, so this build is needed regardless.

### 3.2 Grant permission on the device

Open the app and accept the notification prompt. iOS only asks once — if you
have declined before, **Settings → Mash Potato → Notifications** and turn it
back on. Then confirm the token actually reached the server:

```sql
select platform, left(token, 12) || '…' as token, created_at
  from public.device_tokens order by created_at desc limit 5;
```

**No row means the device never got a token from Apple** — that is a Part 1
problem (capability or stale profile), not a Part 2 problem. Nothing in
Supabase can fix it.

### 3.3 The real test

Have someone else start a round in a group you are both in. You should get
"…started a round" within a few seconds.

If you would rather not wait for a second person, I can run a probe from here
that sends to a deliberately invalid device token and reads the Edge Function
logs: an APNs reply of **`BadDeviceToken`** proves the provider JWT, Key ID,
Team ID and topic are all correct and that only a real device is missing. That
is the strongest check available before hardware is involved.

---

## Sandbox vs production — the rule

APNs has two hosts and a device token is only valid on one of them. Which one
you get is decided by the `aps-environment` entitlement in the build.

| Build | `aps-environment` | Host the token works on |
|---|---|---|
| TestFlight / App Store | `production` | `https://api.push.apple.com` |
| Debug build run from Xcode | `development` | `https://api.sandbox.push.apple.com` |

This repo ships `production` (`ios/App/App/App.entitlements`), and the function
defaults to the production host, so the pair is consistent — leave both alone.
**If you ever change one, change the other**, or every send fails with
`BadDeviceToken` while looking perfectly configured. The same auth key works
for both hosts, so the key is never the thing to change.

---

## When it does not work

Read the Edge Function logs first — Dashboard → **Edge Functions** →
`send-push` → **Logs**. APNs returns a specific reason and the function passes
it through.

| Symptom | Cause |
|---|---|
| Function logs `push not configured` | one of `APNS_AUTH_KEY` / `APNS_KEY_ID` / `APPLE_TEAM_ID` is empty |
| Function returns **401**, no APNs call | `PUSH_SHARED_SECRET` ≠ `notification_config.secret` |
| APNs **403 `InvalidProviderToken`** | Key ID and `.p8` are from different keys, or the Team ID is wrong (easy to paste the Key ID into both) |
| APNs **400 `BadDeviceToken`** | sandbox/production mismatch — see the table above |
| APNs **403 `TopicDisallowed`** | `APNS_TOPIC` set to something other than the bundle id; unset it |
| APNs **410 `Unregistered`** | app was uninstalled; that token is dead and should be deleted from `device_tokens` |
| No row in `device_tokens` at all | Part 1: capability missing, stale provisioning profile, or permission denied on the device |
| Nothing in the logs at all | `push_notify` never fired — check the `notification_config` row still exists (an empty table is "notifications off" by design) |

---

## What a notification is allowed to contain

Payloads are **ID-only**. Score values never ride a notification, and both test
suites assert it. The Edge Function resolves display names and message text
itself using the service key, after deciding who is allowed to receive it. If
you extend the payload, keep that rule — it is the reason a leaked or
mis-delivered notification cannot reveal someone's blind score.
