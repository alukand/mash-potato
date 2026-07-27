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

## 1. App Name — max 30

```
Mash Potato
```

Brand only. Keyword-stuffed names get rejected, and the subtitle is the right
place for the descriptor.

## 2. Subtitle — max 30

```
Rate movies blind with friends
```

Carries the mechanic and four searchable words the name does not. Do not
repeat any of these words in Keywords; Apple indexes name + subtitle +
keywords together and duplicates waste the budget.

**This is exactly 30 of 30 characters — no room.** If you reword it, re-run
`node scripts/check-listing.mjs` before pasting.

## 3. Promotional Text — max 170

Editable any time **without a new build**, so use it for news later.

```
Your group has argued about the same film three times. Build one rubric, everyone scores in private, then the Reveal drops every score at once.
```

## 4. Keywords — max 100

Comma-separated, **no spaces after the commas** (a space costs a character).
Singulars only where Apple already stems the plural.

```
film,review,critic,score,rating,watchlist,cinema,tv,series,club,vote,poll,group,night,watch,taste
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
