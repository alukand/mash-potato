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

## What still needs a human

### 1. The review account — the one thing that still needs you

This is the most likely rejection and the only remaining code-side blocker.

The app requires an account, and Apple **requires working credentials** in App
Store Connect → App Review Information. Two traps:

- **Sign-UP mails a 6-digit code** to an address the reviewer does not
  control, so "they can register themselves" is not a path. It must be a
  pre-made **email + password** account (password sign-in exists; that is the
  flow the reviewer will use).
- **A bare account lands group-less.** Rate shows "no group yet" and there is
  nothing to review.

**Do NOT hand Apple a login to an account that shares a group with real
users.** The hosted database has live groups — "First Testers" alone has four
real people's display names, their individual scores and their DMs in it. A
reviewer signed in there would read all of it, which is precisely what the
blind-score design exists to prevent. The demo account must sit in its own
group with synthetic members, or alone.

**Verified while checking this:** the reveal quorum is
`least(2, greatest(eligible, 1))`, so a **solo round still reveals**. One
account, alone, can run the entire loop end to end. That makes the setup much
smaller than it looks.

**Recipe — about five minutes in the app itself.** Doing it through the UI
rather than by hand-writing rows means the data is real, consistent, and
cannot violate a constraint:

1. Sign up at https://app.mashpotato.app with an address you control
   (`review@mashpotato.app` via Cloudflare Email Routing is tidy) and set a
   password you are willing to put in App Store Connect.
2. Create a group — call it something neutral like "Movie Night".
3. Start a round on a well-known film, score all seven categories, add a
   one-line take, lock, reveal. That single round gives the reviewer the dot
   plot, the Mashed score and the united/split headline.
4. Repeat twice more so Home and the group log are not empty.
5. Rate a couple of titles solo from Discover, and save two or three, so the
   Home stat tiles read 1 / 3 / 3 rather than all zeros.

Then paste into App Review Information → Notes:

```
Sign in with the credentials above (password sign-in, no code needed).
1. The app opens on Home with recent activity.
2. Tap Rate to see the group and its last Reveal: one Mashed score,
   every member's score, and the agree/disagree headline.
3. Tap "Start the next round", pick any film, score the categories,
   then Lock. Scores stay hidden until locked - that is the core idea.
4. Tap Reveal to open the round.
5. Reporting, blocking and account deletion are in Profile and in the
   message thread menus.
A round can be revealed by a single member, so no second account is needed.
```

### 2. ~~iPad~~ — done

`TARGETED_DEVICE_FAMILY` was `"1,2"`, so the app claimed iPad: Apple would
have **reviewed it on an iPad** and **required iPad screenshots**, against a
fixed ~480px column that renders as a strip in an empty field. Set to `1`
(iPhone only) on 2026-07-27. iPad becomes a real piece of work later rather
than an accident of the Capacitor template.

### 3. Screenshots have to be captured, and they are the listing

Required: **iPhone 6.9"** (or 6.7") only, now that the app is iPhone-only.
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

## Submitting, click by click

Everything below is App Store Connect (appstoreconnect.apple.com) unless
stated. The app record already exists: **Mash Potato**, Apple ID 6788610092.

**Before you open ASC**

1. Create and seed the review account (recipe above). Five minutes.
2. Run the Codemagic `ios-testflight` workflow. It sets the build number from
   `$BUILD_NUMBER` via `agvtool`, so you do not have to bump anything by hand,
   but the build number must be higher than any previously uploaded one.
3. Wait for the build to finish processing in TestFlight (usually 5-15
   minutes; you get an email).
4. Install that build and take screenshots at iPhone 6.9", signed in as the
   review account.

**In App Store Connect**

5. **My Apps → Mash Potato → the iOS App version** (create a new version and
   call it `1.0` if one is not already open).
6. **Screenshots** — drag in the 6.9" set. The first three are what people see
   in search results, so lead with a Reveal.
7. **Promotional text / Description / Keywords / Support URL / Marketing URL.**
   Support URL is `https://mashpotato.app/support`; marketing URL is
   `https://mashpotato.app`.
8. **Build** — click the Build section and select the processed build.
9. **General → App Information**: category, and **Privacy Policy URL** =
   `https://mashpotato.app/privacy`.
10. **Age Rating → Edit**: answer the questionnaire. Say yes to
    user-generated content and to unrestricted web access being absent; the
    moderation controls let you answer honestly without landing at 17+.
11. **App Privacy → Get Started**: work through the data types using the table
    above. Answer **no** to tracking everywhere.
12. **App Review Information**: tick *Sign-in required*, enter the review
    account's email and password, and paste the notes block above. Add a
    contact phone and email.
13. **Version Release**: manual release is the safer choice for a first
    version, so an approval does not go public while you are asleep.
14. **Add for Review → Submit**.

**After submitting**

- State goes *Waiting for Review* → *In Review* → *Pending Developer Release*
  (if you chose manual) or *Ready for Sale*.
- First review is typically 24-48 hours.
- A rejection arrives in **Resolution Center** with a guideline number. Reply
  there; you do not need a new build unless they ask for one.

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
