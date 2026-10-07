-- Bump a game's play counter atomically. Read-then-write in JS loses counts
-- when two people start the same game in the same instant, and this counter
-- is the "trending" sort's input, so it needs to be a single statement.
create or replace function public.bump_play_count(p_game uuid)
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.games
     set play_count = play_count + 1
   where id = p_game
  returning play_count;
$$;

revoke all on function public.bump_play_count(uuid) from public, anon, authenticated;
grant execute on function public.bump_play_count(uuid) to service_role;