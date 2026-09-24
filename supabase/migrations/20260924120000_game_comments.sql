-- Persistent per-project comments (shown on view.html).
create table if not exists public.game_comments (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  display_name text not null,
  text text not null check (char_length(text) <= 2000),
  created_at timestamptz default now()
);

create index if not exists game_comments_game_created_idx on public.game_comments (game_id, created_at);

alter table public.game_comments enable row level security;

drop policy if exists "Anyone can read game comments" on public.game_comments;
create policy "Anyone can read game comments" on public.game_comments
  for select using (true);
drop policy if exists "Authenticated can insert game comments" on public.game_comments;
create policy "Authenticated can insert game comments" on public.game_comments
  for insert with check (auth.role() = 'authenticated');
drop policy if exists "Owners can delete own game comments" on public.game_comments;
create policy "Owners can delete own game comments" on public.game_comments
  for delete using (auth.uid() = user_id);
drop policy if exists "Game owners can delete comments on own games" on public.game_comments;
create policy "Game owners can delete comments on own games" on public.game_comments
  for delete using (
    exists (select 1 from public.games where games.id = game_comments.game_id and games.owner_id = auth.uid())
  );
