-- Forums: threads and replies, with OP-assigned labels on replies.
-- RLS enabled with deliberately no policies: service key only, like
-- music_tracks and game_saves. Every read and write goes through server.js
-- auth (writes also seat-checked + verification-gated). Threads and replies
-- are public to read through the API; nothing here is client-accessible.

create table if not exists public.forum_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  pinned boolean not null default false,
  comment_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
create index if not exists forum_threads_last_idx on public.forum_threads (last_at desc);
create index if not exists forum_threads_user_idx on public.forum_threads (user_id);

create table if not exists public.forum_comments (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.forum_threads(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  display_name text not null default 'Unknown',
  text text not null,
  label text,
  created_at timestamptz not null default now()
);
create index if not exists forum_comments_thread_idx on public.forum_comments (thread_id, created_at);

alter table public.forum_threads enable row level security;
alter table public.forum_comments enable row level security;
