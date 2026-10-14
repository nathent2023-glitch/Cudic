-- Music Lab tracks (account-bound, no downloads needed).
-- RLS enabled with deliberately no policies: service key only, like
-- game_likes and game_saves. Every read and write goes through server.js
-- auth (+ seat + verification on writes).

create table if not exists public.music_tracks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  title text not null default 'Untitled track',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists music_tracks_owner_idx
  on public.music_tracks (owner_id, updated_at desc);

alter table public.music_tracks enable row level security;
