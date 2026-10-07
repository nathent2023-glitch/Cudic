-- Transitive remix credit: a remix of a remix still credits the original
-- maker. fork_chain is an ordered snapshot array (oldest first) of
-- {id, title} for every ancestor, extended at fork time and capped. Like
-- forked_from_title, snapshots survive deletions by design; the update
-- endpoint's field allowlist excludes all three columns so the credit
-- cannot be stripped through the API.
alter table public.games
  add column if not exists fork_chain jsonb not null default '[]'::jsonb;

-- Backfill rows forked before the chain existed: single-entry chains.
update public.games c
set fork_chain = jsonb_build_array(jsonb_build_object('id', p.id, 'title', coalesce(p.title, 'Untitled')))
from public.games p
where c.forked_from = p.id
  and (c.fork_chain is null or c.fork_chain = '[]'::jsonb);
