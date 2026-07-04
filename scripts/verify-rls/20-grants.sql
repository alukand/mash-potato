-- The table/function grants the Supabase platform applies to API roles.
-- On a real project these exist as default privileges; RLS (not grants) is
-- what actually restricts row access — which is exactly what we're testing.
-- Run AFTER the migration.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
