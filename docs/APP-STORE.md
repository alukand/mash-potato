# Getting on the App Store

`docs/GOING-LIVE.md` covers the website. `docs/TESTFLIGHT.md` covers building
and uploading. This is the submission itself: what Apple checks, what this app
specifically will get caught on, and what is already done.

Written 2026-07-27. App record: Apple ID **6788610092**, bundle
`com.mashpotato.app`, currently `MARKETING_VERSION 1.0`, build 1.

---

## Already done — do not redo

| Requirement | State |
|---|---|
| Privacy policy at a public URL | https://mashpotato.app/privacy |
| Support URL | https://mashpotato.app/support |
| Both linked **inside** the app | More menu (`MoreSheet`) |
| Account deletion in-app (required since 2022) | Profile → Danger zone → `delete_my_account` |
| UGC: filtering | `banned_terms` wordlist on every comment and message |
| UGC: reporting | comment + message reports |
| UGC: blocking | block/unblock, with an unblock list in Profile |
| UGC: acting on reports within 24h | the moderation queue, flagged overdue past 24h |
| UGC: zero-tolerance agreement before first post | the house rules gate (`accepted_terms_at`) |
| Push notifications | live and delivering |
| `ITSAppUsesNonExemptEncryption` | declared `false` in `Info.plist` |

Guideline **1.2 (user-generated content)** is the one that sinks social apps,
and every clause of it now has an implementation. That was the last structural
blocker.

---

## The three things that will actually hold you up

### 1. The reviewer cannot sign up, and cannot be left staring at an empty app

This is the most likely rejection, and it is entirely avoidable.

The app requires an account. Apple **requires working credentials** in App
Store Connect → App Review Information → Sign-In Required. And note the trap:
**sign-up sends a 6-digit code to an email address the reviewer does not
control**, so "they can just register" is not a path. It has to be a
pre-made **email + password** account (password sign-in exists; use it).

Worse, a bare account lands on a group-less app: Rate shows "no group yet" and
there is nothing to review. So the demo account must be **seeded**:

- a group with 2-3 members (the other members can be dormant accounts)
- at least one **revealed** session, so the Reveal, the Mashed score and the
  united/split headline are visible immediately
- a couple of rated titles and something saved, so Home is not empty

Good news, verified in the schema: the reveal quorum is
`least(2, greatest(eligible, 1))`, so **a solo round still reveals**. A
reviewer alone can run the full loop start to finish without a second human.
Say so in the review notes anyway — do not make them discover it.

Review notes should spell out, in order: sign in with X, open Rate, start a
round on any film, score it, lock, reveal. Five lines. Reviewers follow them
literally.

### 2. The app currently claims iPad support, and is not an iPad app

`ios/App/App.xcodeproj/project.pbxproj` sets
`TARGETED_DEVICE_FAMILY = "1,2"` — iPhone **and** iPad. Consequences:

- Apple **reviews it on an iPad**, and
- iPad screenshots become **required**, and
- the UI is a fixed ~480px mobile column, which on a 13" iPad is a thin strip
  of content in a large empty field. "Does not adapt to iPad" is a routine
  rejection.

For a 1.0, set it to `1` (iPhone only). It is a one-line change, it removes a
whole class of rejection, and iPad can be added later as a real piece of work
rather than an accident of the Capacitor template.

### 3. Screenshots have to be captured, and they are the listing

Required: **iPhone 6.9"** (or 6.7"). If iPad stays enabled, 13" iPad too.
Minimum one, up to ten; the first two or three are what people actually see.

Capture from the simulator or a device with the **seeded demo data**, not an
empty account. The shots that sell this app are the ones nothing else has:

1. a Reveal — the dot plot, the Mashed number, "United on X. Split over Y."
2. the rubric editor with visible weights
3. a blind round mid-scoring, showing the sealed state
4. group history / taste twins
5. Discover

No fake data, no invented names beyond the demo group.

---

## The listing itself

**Name / subtitle.** 30 characters each. The website's positioning works:
settle it, one score your whole group agreed to.

**Description.** Lead with the mechanic — build a rubric, rate blind, reveal
together — not a feature list.

**Keywords.** 100 characters, comma-separated, no spaces after commas, and do
not repeat words already in the name or subtitle.

**Promotional text.** 170 characters, editable without a new build. Useful
later for "now with X".

**Category.** Entertainment, most likely; Social Networking is the alternative
and pulls harsher UGC scrutiny.

**Age rating.** The questionnaire asks about user-generated content and
unrestricted messaging. This app has both, so expect **12+ or higher**. Answer
honestly; understating it is its own rejection, and the moderation tooling is
what lets you answer "yes, with controls" instead of "yes, unmoderated".

**App Privacy questionnaire.** This is the fiddly one, so here is the mapping
from the actual schema:

| Apple data type | Collected? | Linked to identity | Used for tracking | Where it lives |
|---|---|---|---|---|
| Email address | yes | yes | **no** | `auth.users` |
| Name (display name) | yes | yes | no | `profiles.display_name` |
| User content (scores, takes, comments, messages) | yes | yes | no | `member_scores`, `title_comments`, `messages` |
| Identifiers (user ID, device token) | yes | yes | no | `profiles.id`, `device_tokens` |
| Search history | **no** | — | — | TMDB queries are proxied and not stored against a user |
| Location, contacts, health, financial, browsing | **no** | — | — | never collected |
| Usage data / analytics | **no** | — | — | there is no analytics SDK |
| Crash data | **no** | — | — | none wired |

"Used for tracking" is **no** across the board: nothing is shared with data
brokers and there is no cross-app advertising identifier. That answer is what
keeps the privacy label short, and it is true.

**Export compliance.** Already answered by the `Info.plist` key; the upload
will not ask again.

**Content rights.** You do not license third-party content. Note that film
metadata and posters come from TMDB — their attribution requirement is already
honoured in the app, and JustWatch attribution rides with the where-to-watch
data.

---

## Order of operations

1. Decide iPad: set `TARGETED_DEVICE_FAMILY = 1` (recommended) or commit to
   building an iPad layout.
2. Create and seed the demo account.
3. Build and upload via Codemagic (`docs/TESTFLIGHT.md`). Bump
   `CURRENT_PROJECT_VERSION` — App Store Connect rejects a duplicate build
   number.
4. Capture screenshots from that build with the demo data.
5. Fill the listing: name, subtitle, description, keywords, category, age
   rating, App Privacy answers, screenshots, the two URLs.
6. Add App Review Information: demo credentials + the five-line walkthrough.
7. Submit. First review is typically 24-48 hours.

---

## Not blockers, but worth knowing

- **Leaked-password protection** is Supabase **Pro only** (the Management API
  returns 402 on free). Not a submission requirement; worth enabling whenever
  the project is upgraded.
- **`pg_net` lives in `public`** — a standing advisor WARN, service-role
  reachable only. Cosmetic for review purposes.
- **Backups have never been restore-tested.** Not something Apple checks, and
  entirely something you will care about the first time it matters.
- **Fonts load from Google** on the marketing site. Not an app concern, but it
  is a third-party request on a page whose privacy policy you publish;
  self-hosting the three woff2 files closes it.
- **You are enrolling as an individual**, so your legal name is the public
  seller name on the listing. See the header comment in `web/privacy.html`.
