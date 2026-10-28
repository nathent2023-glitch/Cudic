-- Collections: user-curated game lists (public/unlisted/private)
create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '',
  visibility text not null default 'public' check (visibility in ('public', 'unlisted', 'private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collection_items (
  collection_id uuid not null references public.collections(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (collection_id, game_id)
);

create index if not exists collections_owner_idx on public.collections (owner_id, created_at desc);
create index if not exists collection_items_game_idx on public.collection_items (game_id);
