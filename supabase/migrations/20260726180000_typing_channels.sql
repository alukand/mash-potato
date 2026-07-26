-- Typing indicators, and the authorization that makes them private.
--
-- Typing is sub-second, per-keystroke, and worthless the moment it is stale,
-- so it is Realtime BROADCAST and never a table: a row per keystroke would be
-- a WAL record, a postgres_changes fan-out, and dead-tuple bloat on the app's
-- hottest path.
--
-- This is the app's first use of anything beyond postgres_changes. Broadcast
-- on a PUBLIC channel would make the topic name the only secret, so these
-- policies gate it properly: Realtime evaluates RLS on `realtime.messages`
-- for channels connected with { config: { private: true } }, and the topic is
-- readable inside the policy via realtime.topic().
--
-- Topic shape: 'typing:<conversation_id>'. is_conversation_member() reads
-- auth.uid() itself, so a non-member can neither send nor receive on it.
--
-- NOTE these policies only affect PRIVATE channels. Every existing
-- subscription in the app (reveal-*, poll-*, discussion-*, thread-*, inbox-*)
-- is a public channel doing postgres_changes and is untouched by this.

-- Members may RECEIVE typing pings for their own conversations.
create policy typing_read_members
  on realtime.messages
  for select
  to authenticated
  using (
    realtime.topic() like 'typing:%'
    and public.is_conversation_member(
      nullif(split_part(realtime.topic(), ':', 2), '')::uuid
    )
  );

-- ...and SEND them, on the same terms.
create policy typing_write_members
  on realtime.messages
  for insert
  to authenticated
  with check (
    realtime.topic() like 'typing:%'
    and public.is_conversation_member(
      nullif(split_part(realtime.topic(), ':', 2), '')::uuid
    )
  );
