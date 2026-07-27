# The listing, field by field

Copy-paste source for every text box in App Store Connect, plus the exact
click path. `docs/APP-STORE.md` is the why; this is the what-to-type.

Character counts in this file are **verified by
`node scripts/check-listing.mjs`**, not eyeballed. Re-run it if you edit
anything.

> **A note on the age rating.** Apple replaced the old 4+/9+/12+/17+ tiers with
> **4+ / 9+ / 13+ / 16+ / 18+**. An earlier draft of `APP-STORE.md` said "12+";
> under the current tiers expect **13+, possibly 16+**. Do not try to steer it:
> answer the questionnaire honestly and take the rating it computes.

---

## 1. App Name — max 30 — ALREADY SET, leave it

```
Mash Potato: Rate Movies & TV
```

29/30. This is what App Store Connect already has, and it is good: it carries
the brand plus three searchable words. **Do not change it**, and note the
consequence below.

## 2. Subtitle — max 30

```
Blind scoring for film clubs
```

28/30, two to spare.

**Why not "Rate movies blind with friends" (my earlier draft):** the app name
already contains *Rate*, *Movies* and *TV*. Apple indexes name + subtitle +
keywords as one pool, so repeating those words spends the budget twice and
buys nothing. This version adds *blind*, *scoring*, *film* and *clubs* — four
new terms — instead.

## 3. Promotional Text — max 170

Editable any time **without a new build**, so use it for news later.

```
Your group has argued about the same film three times. Build one rubric, everyone scores in private, then the Reveal drops every score at once.
```

## 4. Keywords — max 100

Comma-separated, **no spaces after the commas** (a space costs a character).
Nothing here repeats a word from the name or the subtitle.

```
review,critic,watchlist,cinema,series,vote,poll,group,night,watch,taste,friends,together,verdict
```

## 5. Description — max 4000

```
Most rating apps ask one person for one number. Mash Potato asks your whole group.

You build the rubric together, everyone scores in private, and the Reveal drops all the scores at once into a single number your group actually agreed to.

HOW A ROUND WORKS

1. Agree once. Decide what counts and how much: Story against Pacing, whether a soundtrack can rescue a film. Set the weights once and every film after that is measured the same way.

2. Score blind. Everyone rates on their own. Nobody sees anybody else's number until they have locked their own in, so no one anchors on the loudest opinion in the room.

3. Reveal together. All the scores drop at once. You get one Mashed score for the film, and a headline naming the category you agreed on and the one that split you.

THE ARGUMENT IS THE POINT

Mash Potato tells you where you disagreed, not just what you scored. After a few nights it can tell you who you actually share taste with and where you reliably part ways. It never ranks members against each other.

WHAT ELSE IS IN THERE

- Genre-aware rubrics. Comedy night weights Humor heavier than Story. Horror does the same for Fear Factor.
- Not in the mood to configure anything? Run a group on Normies instead: Enjoyment, Acting, Writing. Three sliders.
- Where to watch, shown on the film you are about to start a round on.
- Vote on what to watch, then roll the winner straight into a round.
- Group chat and direct messages.
- A Reveal exports as a shareable image carrying the score, the spread and the headline, never anyone's individual number.

Film and TV data from TMDB. Streaming availability from JustWatch.
```

## 6. What's New

First version: leave blank, or `First release.` ASC often hides this field
until version 2.

## 7. The short fields

| Field | Exactly what to enter |
|---|---|
| Primary category | **Entertainment** |
| Secondary category | Leave empty (Social Networking invites harsher UGC review) |
| Support URL | `https://mashpotato.app/support` |
| Marketing URL | `https://mashpotato.app` |
| Privacy Policy URL | `https://mashpotato.app/privacy` |
| Copyright | `2026 <your full legal name>` — year, space, name. No © symbol. |
| Sign-in required | **Yes** |

## 8. App Review Information → Notes

```
Sign in with the credentials above. Use password sign-in; no email code is needed.

1. The app opens on Home with recent activity.
2. Tap Rate to see the group and its most recent Reveal: one combined "Mashed" score, every member's score on a scale, and a headline naming the category the group agreed on and the one that split them.
3. Tap "Start the next round", pick any film, score the categories, then Lock. Scores stay hidden until every member locks. That is the core idea of the app.
4. Tap Reveal to open the round.
5. Reporting and blocking are in the message thread menu and on comments. Account deletion is in Profile under the settings gear, in the Danger zone.

A round can be revealed by a single member, so no second account is needed to see the full flow.

User-generated content controls: a filtered wordlist on all posts and messages, per-item reporting, user blocking, an agreement to house rules before a first post, and a moderator queue that flags anything older than 24 hours.
```

---

## Screen by screen, exactly as ASC shows it

Written against the real 1.0 page, top to bottom. Anything not named here is
left alone.

### Screenshots — the "iPhone 6.5" Display" box

Accepted sizes, portrait: **1242 x 2688** or **1284 x 2778**.

Straight from an iPhone works only if the phone produces one of those:
11 Pro Max / XS Max give 1242 x 2688; 12/13/14 Pro Max give 1284 x 2778.
A 15/16 Pro gives 1179 x 2556 and a 15/16/17 Pro Max gives 1290 x 2796 —
both refused. **Do not resize by hand**; run:

```
powershell -File scripts\shots.ps1 -In "C:\path	oaw\screenshots"
```

It scales to fit (never crops), centres on the app's own #15121B background so
the couple of pixels of padding are invisible, strips the alpha channel Apple
rejects, and numbers the files so ASC keeps your order. Output lands in an
`asc-ready` subfolder.

Take them signed in as the **review account**. No real users' names or scores.

Drag 3-5 in. Order matters: the first three are what shows in search.

1. a Reveal (Mashed score + the dot plot + the united/split headline)
2. the blind round mid-scoring
3. the rubric with its weights
4. Home
5. Discover

`Choose File` works too if dragging is awkward.

### Promotional Text

Paste section 3. 143/170.

### Description

Paste section 5. 1634/4000.

### Keywords

Paste section 4. 96/100.

### Support URL

```
https://mashpotato.app/support
```

### Marketing URL

```
https://mashpotato.app
```

### Version

Already `1.0`. Leave it.

### Copyright — max 200

```
2026 <your full legal name>
```

Year, space, name. No (c) symbol. Enrolled as an individual, this is your
personal legal name.

### Routing App Coverage File

Skip. That is for maps apps.

### App Clip

Skip. The warning is normal; you have no clip.

### iMessage App

Skip. You have no iMessage extension, so it needs no screenshots.

### Build

`Add Build`, pick the processed build. If nothing is listed it is still
processing in TestFlight; wait for the email and come back.

### In-App Purchases and Subscriptions

Nothing to do. There are none.

### Game Center

**Leave the checkbox unticked.**

### App Review Information

- **Sign-in required** — already ticked. Leave it.
- **User name** — the review account's email address.
- **Password** — its password.
- **First name / Last name / Phone number / Email** — yours. A real reachable
  phone and inbox; this is how they contact you about a rejection.
- **Notes** — paste section 8.
- **Attachment** — skip.

### App Store Version Release

Currently set to **Automatically release this version**.

**Change it to `Manually release this version`** (the first radio button).
Otherwise approval can push it public at 3am with no chance to check the
listing first. You get a Release button when it is approved.

### Then

**Save** (top right), then **Add for Review**.

---

## The other two sections, in the left sidebar

These live outside the version page and must both be done or Add for Review
will refuse.

### App Information (General -> App Information)

- **Primary Category**: Entertainment
- **Secondary Category**: leave empty
- **Privacy Policy URL**: `https://mashpotato.app/privacy`
- **Subtitle**: paste section 2
- Save.

### Age Rating (inside App Information)

Answer honestly. For this app:
- Violence, sexual content, nudity, profanity, horror, gambling, contests,
  drugs, alcohol: **None**.
- **User-generated content / in-app communication: Yes** — you have comments,
  group chat and DMs. Saying no is a rejection and a takedown risk.
- Whether it is moderated: **yes** — filtering, reporting, blocking and a
  24-hour queue.
- Unrestricted web access: **No**. No embedded browser.

Expect **13+**, possibly 16+. Take what it computes.

### App Privacy (Trust & Safety -> App Privacy)

`Get Started`, then "Do you collect data from this app?" -> **Yes**.

Tick exactly these four and nothing else:

| Section | Item |
|---|---|
| Contact Info | Email Address |
| Contact Info | Name |
| User Content | Other User Content |
| Identifiers | User ID |

For each of the four: purpose **App Functionality**, linked to the user
**Yes**, used for tracking **No**.

Leave Usage Data, Diagnostics, Search History, Location, Purchases and
Contacts unticked — none are collected. No analytics SDK, no crash reporter,
and TMDB searches are proxied rather than stored against a user.

Then **Publish**.

---

## The click path

Everything is at appstoreconnect.apple.com. The app record exists already:
**Mash Potato**, Apple ID 6788610092.

**Before ASC**

1. Create the review account and seed it (recipe in `APP-STORE.md`).
2. Run Codemagic `ios-testflight`. Wait for the "ready to test" email.
3. Install that build, sign in as the review account, take screenshots at
   iPhone 6.9".

**App Information** (left sidebar, applies to all versions)

4. **My Apps → Mash Potato → App Information**.
5. Set **Primary Category** = Entertainment. Leave Secondary empty.
6. Paste the **Privacy Policy URL**.
7. **Save** (top right).

**Age Rating**

8. Still in App Information → **Age Rating → Edit**.
9. Work through the questionnaire. The answers that matter for this app:
   - Violence, sexual content, nudity, profanity in the app's own content,
     horror, gambling, contests, drugs: **None**.
   - **User-generated content / user communication: Yes.** You have chat, DMs
     and comments. Saying no here is a rejection and a removal risk.
   - When asked whether you moderate it: **yes** — you have filtering,
     reporting, blocking and a moderation queue.
   - Unrestricted web access: **No**. The app does not embed a browser.
10. **Done**, then **Save**.

**App Privacy**

11. Left sidebar → **App Privacy → Get Started** (or **Edit**).
12. "Do you collect data from this app?" → **Yes**.
13. Select these data types and nothing else:
    - **Contact Info → Email Address**
    - **Contact Info → Name**
    - **User Content → Other User Content** (scores, takes, comments, messages)
    - **Identifiers → User ID**
14. For **every** type: purpose **App Functionality**, linked to identity
    **Yes**, used for tracking **No**.
15. Do **not** select Usage Data, Diagnostics, Search History, Location,
    Purchases, or Contacts. None are collected: there is no analytics SDK, no
    crash reporter, and TMDB searches are proxied rather than stored against a
    user.
16. **Publish**.

**The version**

17. Left sidebar → the **iOS App 1.0** version (create it if absent).
18. **Screenshots** — drag the 6.9" set in. The first three show in search
    results, so lead with a Reveal.
19. **Promotional Text**, **Description**, **Keywords**, **Support URL**,
    **Marketing URL** — paste from above.
20. **Build** — click **+** or **Add Build**, pick the processed build. If it
    is missing, it is still processing.
21. **General Information** → **Copyright**.
22. **App Review Information** → tick **Sign-in required**, enter the review
    account email and password, paste the notes block. Fill first name, last
    name, phone and email so they can reach you.
23. **Version Release** → **Manually release this version**. An approval then
    waits for you instead of going public at 3am.
24. **Save**, then **Add for Review** → **Submit**.

**After**

- *Waiting for Review* → *In Review* → *Pending Developer Release*.
- Typically 24-48 hours for a first review.
- Rejections arrive in **Resolution Center** with a guideline number. Reply
  there. Most rejections need a reply, not a new build.
- When approved: the version page gets a **Release This Version** button.
