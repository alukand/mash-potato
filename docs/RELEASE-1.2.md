# Releasing 1.2

1.2 is built on branch `next`. It adds five things:

- **Seasons and episodes.** Rate any season or episode on its own, start a
  group round on one, and discuss it apart from the show
  (`20261001180000_tv_parts.sql`, CLAUDE.md "SEASONS AND EPISODES").
- **A bolder Reveal card** you can post or save to Photos. It still carries
  only the group's numbers (DESIGN.md "What a shared card may carry").
- **Groups that review who joins**, with an optional question for people who
  ask (`20261002120000_join_requests.sql`, CLAUDE.md "JOIN REQUESTS").
- **Following**, and ratings people choose to share with their followers
  (`20261002140000_follows.sql`, CLAUDE.md "FOLLOWS AND SHARED RATINGS").
- **Round games**: a fight over the most split category at the Reveal, and a
  vote for the best take, with badges on a group trophy shelf
  (`20261003120000_round_games.sql`, CLAUDE.md "ROUND GAMES").

## The order matters

Pushing `master` deploys the web app at once (both Cloudflare Pages projects
build from it). So the database and the functions go first, and the merge
goes last.

1. **Database.** From a checkout of the branch you are releasing:

   ```
   npx supabase migration list --linked
   npx supabase db push --linked
   ```

   The list should show exactly four local-only migrations:
   `20261001180000`, `20261002120000`, `20261002140000`, `20261003120000`.
   If Live's migrations (`20260928...`) appear, you are on the wrong branch.

   Then probe the new functions the way CLAUDE.md asks (the suites cannot
   catch a missing `anon` revoke): an anon-key POST to
   `/rest/v1/rpc/round_game_state`, `cast_round_vote` and `group_trophies`
   must answer 401, while `public_profile` answers 200.

   `20261003120000` also takes away direct client UPDATEs on a round's row
   (no app version ever made one; the reveal is an RPC). 1.1 keeps working.

2. **Functions.** Both changed:

   ```
   npx supabase functions deploy tmdb-search
   npx supabase functions deploy send-push
   ```

   `tmdb-search` serves the seasons list and the `season` op; `send-push`
   learns `join_requested` and `fight_started`. An older deployed function degrades quietly (no
   seasons list, no join-request push), but ship them together.

3. **Version.** Bump `MARKETING_VERSION` to 1.2.0 in
   `ios/App/App.xcodeproj/project.pbxproj` (both build configurations).

4. **Legal pages.** `web/privacy.html` and `web/terms.html` describe join
   requests, follows and sharing. Set their Effective date to the day they go
   live.

5. **Review notes.** `review-notes.txt` section 5 covers the new features for
   App Review. Update its first paragraph if anything changes.

6. **Build** in Codemagic from `next`, test on TestFlight, then merge `next`
   into `master` and push. That deploys the website and the web app.

## Checks after release

- A show page lists its seasons; a season lists its episodes; rating an
  episode creates a "Show S2E3" title.
- In a group set to "I approve each one", a request reaches the owner (push
  and the "Asking to join" card) and approving adds the member.
- Following someone who shares shows their ratings under "Recently rated by
  people you follow" on Home.
- Share a Reveal on an iPhone and tap Save Image: the card lands in Photos
  (the first time, iOS asks for permission to add photos).
- In a group of three, reveal a round where two people are 3+ points apart
  on one category: both get a "Fight!" push, each makes a case, the third
  person judges, and the winner lands on the trophy shelf.
- Switch a group's Best take to Blind: the next round's scorecard asks for a
  take, and the takes drop together at the reveal.

## For App Review

The review account's group ("Movie Night") has only rounds from before round
games, so nothing there shows a fight or a take. If you want the reviewer to
see the Report button on a take, play one round with the review account and
its second member before submitting, with Best take on.
