-- Adding or removing a title bumps the playlist's updated_at server-side, so
-- "freshest first" holds without a client round-trip (and without trusting
-- the client clock). Runs as the invoker, not SECURITY DEFINER: item writes
-- are owner-only by RLS, and playlists_update_own admits the owner, so the
-- inner UPDATE always passes. Playlist delete cascades fire it against a
-- row that is already gone: a harmless zero-row update.
create or replace function public.touch_parent_playlist()
returns trigger language plpgsql set search_path = '' as $$
begin
  update public.playlists
    set updated_at = now()
    where id = coalesce(new.playlist_id, old.playlist_id);
  return coalesce(new, old);
end;
$$;

create trigger playlist_items_touch_playlist
  after insert or delete on public.playlist_items
  for each row execute function public.touch_parent_playlist();

-- Newest-first covers per playlist (fetchMyPlaylists / public profiles).
create index playlist_items_playlist_added_idx
  on public.playlist_items (playlist_id, added_at desc);
