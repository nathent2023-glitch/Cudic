-- Forum threads get a category (help / showcase / bug) and can point at one
-- published game. Existing threads become Help so nothing changes shape.
alter table public.forum_threads
  add column if not exists category text not null default 'help',
  add column if not exists game_id uuid references public.games(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'forum_threads_category_check') then
    alter table public.forum_threads
      add constraint forum_threads_category_check check (category in ('help', 'showcase', 'bug'));
  end if;
end $$;

create index if not exists forum_threads_category_idx on public.forum_threads (category, last_at desc);
create index if not exists forum_threads_game_idx on public.forum_threads (game_id);
