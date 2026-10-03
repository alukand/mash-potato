# Releasing 1.1

1.1.0 is everything since 1.0, built from branch `release-1.1`. Mash Potato
Live (live shows, watch parties, giveaways) is not in it: it stays parked on
`live-shows`.

## What is in it

Already on `master` and on the hosted database since 2026-10-01:

- **The mascot rebrand** and the sticker set.
- **Tokens**, behind the `rewards` flag, which stays off until just before
  review (`docs/REWARDS.md`), and the feature-flag store that switches it.
- Cloudflare Web Analytics allowed on both sites and disclosed, and the Save
  Image fix (`NSPhotoLibraryAddUsageDescription`).

New in this build:

- **Seasons and episodes.** Rate any season or episode on its own, start a
  group round on one, and discuss it apart from the show
  (`20261001180000_tv_parts.sql` and `20261003130000_tv_parts_old_apps.sql`,
  CLAUDE.md "SEASONS AND EPISODES").
- **A bolder Reveal card** you can post or save to Photos. It still carries
  only the group's numbers (DESIGN.md "What a shared card may carry").
- **Groups that review who joins**, with an optional question for people who
  ask (`20261002120000_join_requests.sql`, CLAUDE.md "JOIN REQUESTS").
- **Following**, and ratings people choose to share with their followers
  (`20261002140000_follows.sql`, CLAUDE.md "FOLLOWS AND SHARED RATINGS").
- **Round games**: a fight over the most split category at the Reveal, and a
  vote for the best take, with badges on a group trophy shelf
  (`20261003120000_round_games.sql`, CLAUDE.md "ROUND GAMES").
- **The sliced-potato app icon** (`assets/icon/mash-potato-icon.svg`), on the
  home screen and in the browser tab. The mascot stays the logo everywhere
  else.

## The order matters

Pushing `master` deploys the website and the web app at once (both Cloudflare
Pages projects build from it). So the database and the functions go first,
then the build and a TestFlight check, and the merge last of all, before you
submit.

1. **Database.** From the repo on branch `release-1.1`:

   ```
   npx supabase migration list --linked
   npx supabase db push --linked
   ```

   The list should show exactly five local-only migrations: `20261001180000`,
   `20261002120000`, `20261002140000`, `20261003120000` and `20261003130000`.
   If Live's migrations (`20260928...`) appear, you are on the wrong branch.
   `db push` can end with a "failed to cache migrations catalog" certificate
   error and exit 255 AFTER the migrations land: check with `migration list`
   and do not run it again.

   Everything already in use keeps working against the new database: 1.0 on
   the App Store, the 1.1 builds testers have, and the web app on `master`.
   That is what `20261003130000` is for. A season or an episode has no TMDB id
   of its own, so the apps that look a title up by its TMDB id still find one
   row once people rate episodes. `20261003120000` also takes away direct
   client updates on a round's row, which no app version ever made.

   Then probe the new functions the way CLAUDE.md asks (the test suites cannot
   catch a missing `anon` revoke): an anon-key POST to
   `/rest/v1/rpc/round_game_state`, `cast_round_vote` and `group_trophies`
   must answer 401, while `public_profile` answers 200.

2. **Functions.** Both changed:

   ```
   npx supabase functions deploy tmdb-search
   npx supabase functions deploy send-push
   ```

   `tmdb-search` serves the seasons list and the `season` op; `send-push`
   learns `join_requested` and `fight_started`, and opens a reply on an
   episode at its show. Deploy them after the database: `send-push` reads a
   column the migrations add.

3. **Build** in Codemagic from `release-1.1`. `MARKETING_VERSION` is already
   1.1.0 and Codemagic numbers the build. Test it on TestFlight (the checks
   below).

4. **Merge.** Set the Effective date in `web/privacy.html` and
   `web/terms.html` to the day, fast-forward `master` to `release-1.1`, and
   push. That deploys the website (the policies gain join requests, follows
   and round games) and the web app. Do it before submitting: App Review
   reads the privacy policy.

5. **Submit.** Turn `rewards` on just before (`docs/REWARDS.md`), so the
   reviewer sees tokens working. `review-notes.txt` is the App Review note,
   and "What's New" is below.

## Checks on TestFlight

- The home-screen icon is the sliced potato.
- A show page lists its seasons; a season lists its episodes; rating an
  episode creates a "Show S2E3" title, and the show's own page stays
  separate.
- In a group set to "I approve each one", a request reaches the owner (push
  and the "Asking to join" card) and approving adds the member.
- Following someone who shares shows their ratings under "Recently rated by
  people you follow" on Home.
- Share a Reveal and tap Save Image: the card lands in Photos (the first
  time, iOS asks for permission to add photos).
- In a group of three, reveal a round where two people are 3+ points apart on
  one category: both get a "Fight!" push, each makes a case, the third person
  judges, and the winner lands on the trophy shelf.
- Switch a group's Best take to Blind: the next round's scorecard asks for a
  take, and the takes drop together at the reveal.

## For App Review

The review account's group ("Movie Night") has only rounds from before round
games, so nothing there shows a fight or a take. If you want the reviewer to
see the Report button on a take, play one round with the review account and
its second member before submitting, with Best take on.

## What's New (App Store text)

```
Rate any season or episode on its own, or score one with your group.

Round games: when your group splits on a category, the top and bottom
scorers each make their case and everyone else picks the winner. Turn on
Best take and the group votes for the sharpest take of the night. Wins
collect as badges on your group's trophy shelf.

Earn tokens: claim one a day, rate with your group, and write reviews.

Share a bolder Reveal card, or save it to Photos.

Searchable groups can ask a question and approve who joins.

Follow friends and see the ratings they choose to share.

And a new look: meet the potato.
```
