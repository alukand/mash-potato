# Tokens: running the rewards program

Members earn tokens for using Mash Potato. Balances are private, amounts are
capped, and quality earns more than volume. Nothing can be spent yet. The
rules are in CLAUDE.md ("REWARDS"); why they look like this is in DESIGN.md
("Reward loop law").

## What earns (the defaults)

| Action | Tokens | Limit |
| --- | --- | --- |
| Daily token (tap to claim) | 1 | once per local day |
| Rate a film with your group (locked card, revealed round, 2+ cards) | 3 | once per film; 5 a day |
| Rate a film solo | 1 | once per film; 5 a day |
| Write a public take on a film | 3 | once per film; 3 a day |
| Long-take bonus (300+ real characters) | +2 | pending 48 hours; voided if the take comes down first |
| Someone else reacts to your take | +1 | once per take |

A film rated or reviewed before launch never pays ("start fresh").

## Launching

1. **Deploy the database:** `npx supabase db push --linked`. The `rewards` flag
   arrives **off**, so nothing earns yet.
2. **Ship the app release that has the Tokens screens.** While the flag is
   off, every token surface stays hidden.
3. **Put the legal pages live:** deploy the website, so the Tokens sections of
   `web/terms.html` and `web/privacy.html` are public. Check that their
   Effective dates match the day they go up.
4. **Turn tokens on just before submitting for review**, so the reviewer sees
   them working (the review notes, section 4, describe them):

```sql
update public.feature_flags set enabled = true where key = 'rewards';
```

The first time it turns on, the program stamps its start and records every
film already rated or reviewed as never paying. That happens once; turning it
off and on later does not redo it.

## The switch

```sql
-- off: nothing earns, and the app hides every token surface on next launch
update public.feature_flags set enabled = false where key = 'rewards';
-- check
select key, enabled, updated_at from public.feature_flags;
select started_at from public.token_program;
```

Turning it off never deletes anything. Balances come back when it turns on.

## Tuning (no app update needed)

```sql
-- amounts and daily caps
select * from public.token_rules order by key;
update public.token_rules set tokens = 2 where key = 'rating_solo';
update public.token_rules set daily_cap = 10 where key = 'rating_solo';
-- the long-take bonus's thresholds and hold
update public.token_rules
   set settings = settings || '{"min_chars": 400, "hold_hours": 72}'
 where key = 'take_bonus';
```

The Tokens screen reads these, so the app always says what actually pays.

## Looking into an account, and fixing one

```sql
-- someone's ledger, newest first
select l.id, l.kind, l.amount, l.status, l.matures_at, l.created_at, t.name
  from public.token_ledger l
  left join public.titles t on t.id = l.title_id
 where l.user_id = (select id from auth.users where email = 'person@example.com')
 order by l.id desc;

-- the biggest earners this week (a fraud review starts here)
select u.email, sum(l.amount) as earned, count(*) as entries
  from public.token_ledger l join auth.users u on u.id = l.user_id
 where l.created_at > now() - interval '7 days' and l.amount > 0
 group by u.email order by earned desc limit 25;

-- a manual correction (positive or negative), with a reason
insert into public.token_ledger (user_id, kind, amount, earned_on, detail)
select id, 'adjustment', -20, current_date, '{"reason": "duplicate accounts"}'
  from auth.users where email = 'person@example.com';
```

Never edit or delete ledger rows. Correct them with an `adjustment`, so the
history stays true. Banning an account (moderation) stops it earning. Content
moderators remove has its tokens clawed back automatically.

## Before building spending (the redemption phase)

Tokens become money the day they can be redeemed. Do not ship redemption
without:

- **A provider.** Gift cards should come from a provider's API (Tremendous,
  Tango Card or similar carry AMC, Regal, Cinemark and Fandango), called from
  an Edge Function with the key in Supabase secrets, never in the app. True
  local independent theaters are usually not in these catalogs.
- **Program terms** for redemption: exchange rate, availability, expiry, US
  only or not. Have a lawyer read them.
- **Fraud gates.** Set a minimum account age and verified email, review each
  account's first redemption by hand, cap redemptions per month, and check for
  multi-account patterns (the query above is the start).
- **Taxes.** Rewards worth $600 or more to one person in a year can require a
  1099. The simplest policy is a yearly cap below that.
- **App Store.** Physical gift cards for in-app activity are fine. Unlocking
  digital features with tokens needs care under guideline 3.1.1. Never let
  tokens be bought.
- **Spending in the ledger.** Lock the account row (`token_accounts ... for
  update`), recompute the balance (available plus matured pending), and write
  a negative row. Never trust a balance the client sent.
