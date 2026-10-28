-- Creator page comments (public, read-only page; comments are the only write)
create table if not exists public.creator_comments (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.users(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists creator_comments_creator_idx
  on public.creator_comments (creator_id, created_at desc);

create index if not exists creator_comments_author_idx
  on public.creator_comments (author_id, created_at desc);
