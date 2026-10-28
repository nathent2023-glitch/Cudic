-- Game star ratings (1–5, one per user per game)
create table if not exists public.game_ratings (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

create index if not exists game_ratings_game_idx
  on public.game_ratings (game_id);
