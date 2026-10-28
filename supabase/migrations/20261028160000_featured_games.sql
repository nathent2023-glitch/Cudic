-- Featured games: moderator-curated, time-bounded
alter table public.games add column if not exists featured boolean not null default false;
alter table public.games add column if not exists featured_until timestamptz;

create index if not exists games_featured_idx
  on public.games (featured) where featured = true;
