-- Discovery: make published games findable (tags, play counts, likes) and
-- give profiles a bio + interests.
--
-- tags is text[] rather than a join table: the vocabulary is small and
-- unbounded, filters are "has any of these", and one column keeps the
-- gallery query to a single round trip. Switch to a table only if tags
-- ever need moderation or per-tag pages.

alter table public.games add column if not exists tags text[] not null default '{}';
alter table public.games add column if not exists play_count bigint not null default 0;

create index if not exists games_tags_idx
  on public.games using gin (tags) where published = true;
create index if not exists games_trending_idx
  on public.games (play_count desc, updated_at desc) where published = true;
-- Text search is an ilike scan over published games only. Fine while the
-- gallery is hundreds of rows; add pg_trgm indexes if it ever isn't.

-- Likes: one row per (user, game).
create table if not exists public.game_likes (
  user_id uuid not null references public.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index if not exists game_likes_game_idx on public.game_likes (game_id);
create index if not exists game_likes_user_idx on public.game_likes (user_id, created_at desc);

alter table public.game_likes enable row level security;
-- Deliberately no policies: service key only, like game_saves. Every read
-- and write goes through server.js auth (+ seat) checks.
-- (Counts come from a count query, not from a client-side select.)

-- Profile: short bio plus a few interests.
alter table public.users add column if not exists bio text not null default '';
alter table public.users add column if not exists interests text[] not null default '{}';

-- Chat search: server-side message search is an ilike scan per channel.
-- Same deal as the gallery — fine at current volume.