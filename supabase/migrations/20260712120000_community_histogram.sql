-- title_community_histogram(): the Letterboxd-style rating distribution for a
-- title's community (solo) ratings. Same SECURITY DEFINER shape as
-- title_community_score — it reads across ALL users but returns ONLY bucketed
-- counts (each user's weighted score rounded to 1..10), never an individual
-- row. Buckets with no ratings are simply absent; the client fills zeros.

create or replace function public.title_community_histogram(p_title_id uuid, p_weights jsonb)
returns table (bucket integer, n integer)
language sql security definer set search_path = '' stable as $$
  select
    greatest(1, least(10, round(w.value)::integer)) as bucket,
    count(*)::integer as n
  from public.global_ratings gr
  cross join lateral (
    select sum((gr.scores->>k)::numeric * (p_weights->>k)::numeric)
           / nullif(sum((p_weights->>k)::numeric), 0) as value
    from jsonb_object_keys(p_weights) as k
    where gr.scores ? k
  ) w
  where gr.title_id = p_title_id and w.value is not null
  group by 1
  order by 1;
$$;

revoke execute on function public.title_community_histogram(uuid, jsonb) from public;
grant execute on function public.title_community_histogram(uuid, jsonb) to authenticated;
