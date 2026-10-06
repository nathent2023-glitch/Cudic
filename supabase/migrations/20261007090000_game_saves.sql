-- Account-bound game saves: progress follows the login across days and
-- devices. One row per (user, game); games store an opaque JSON blob
-- (full state or bests — the game decides). Guests never get rows (they
-- get a sign-in nudge instead). No backfill: saves appear as players play.
create table if not exists public.game_saves (
  user_id uuid not null references public.users(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index if not exists game_saves_updated_idx
  on public.game_saves (user_id, updated_at desc);

alter table public.game_saves enable row level security;
-- Deliberately no policies: only the service key touches this table.
-- (A per-user select policy would be the textbook shape, but every access
-- path here goes through server.js auth + seat checks, so RLS stays shut.)
