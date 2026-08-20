-- Seed the App Store reviewer's demo account with something to moderate.
--
-- Guideline 1.2 asks the reviewer to demonstrate REPORTING a message and
-- BLOCKING a user. Both need an incoming message from someone else, and Block
-- only appears in the thread menu for DMs (ThreadScreen gates it on
-- meta.kind === 'dm'), so this opens a DM to the demo account from another
-- member of its group and sends one message.
--
-- WHERE TO RUN IT: Supabase dashboard -> SQL Editor, on the hosted project.
-- No psql meta-commands (\set) are used, because that editor is not psql.
--
-- Safe to re-run: start_dm is idempotent per pair, and the guard below will
-- not send a second message.
--
-- EDIT ONE LINE: v_demo_email, just below.

do $$
declare
  v_demo_email constant text := 'REPLACE_WITH_DEMO_ACCOUNT_EMAIL';
  v_demo  uuid;
  v_group uuid;
  v_other uuid;
  v_conv  uuid;
  v_count int;
begin
  select id into v_demo from auth.users
   where lower(email) = lower(v_demo_email);
  if v_demo is null then
    raise exception 'No account with email %. Use the one you gave Apple in App Review Information.', v_demo_email;
  end if;

  -- The group the demo account is in, and a DIFFERENT member of it. Sharing a
  -- group is what lets the DM open accepted instead of as a pending request.
  select gm.group_id into v_group
    from public.group_members gm
   where gm.user_id = v_demo
   order by gm.joined_at
   limit 1;
  if v_group is null then
    raise exception 'The demo account is not in any group, so it has no groupmate to message it.';
  end if;

  select gm.user_id into v_other
    from public.group_members gm
   where gm.group_id = v_group and gm.user_id <> v_demo
   order by gm.joined_at
   limit 1;
  if v_other is null then
    raise exception 'That group has only the demo account in it. Add a second member first.';
  end if;

  -- send_message refuses until the sender has accepted the community terms.
  update public.profiles
     set accepted_terms_at = coalesce(accepted_terms_at, now())
   where id = v_other;

  -- Act AS the other member: the RPCs read auth.uid() out of this setting, so
  -- the message is genuinely theirs and every check runs as it does in the app.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated')::text,
    true
  );

  v_conv := public.start_dm(v_demo);

  select count(*) into v_count
    from public.messages m
   where m.conversation_id = v_conv and m.sender_id = v_other and not m.deleted;

  if v_count = 0 then
    perform public.send_message(
      v_conv,
      'Pacing dragged for me, but that ending was worth the wait. What did you make of it?'
    );
    raise notice 'Done: seeded a DM message into conversation %.', v_conv;
  else
    raise notice 'Nothing to do: conversation % already has % message(s).', v_conv, v_count;
  end if;
end $$;
