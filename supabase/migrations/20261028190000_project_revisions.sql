-- Project revision history (manual snapshots per game)
create table if not exists public.project_revisions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete cascade,
  label text not null default '',
  files jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists project_revisions_game_created_idx
  on public.project_revisions (game_id, created_at desc);
