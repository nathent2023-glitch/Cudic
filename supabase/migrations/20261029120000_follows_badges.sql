-- Follows (one-way subscribe), badge/flair/title awards, and the activity
-- feed. All three are service-role only: RLS on, no policies — the client
-- goes through server.js, never these tables directly.
create table if not exists public.follows (
  follower_id uuid not null
    constraint follows_follower_fk references auth.users(id) on delete cascade,
  followed_id uuid not null
    constraint follows_followed_fk references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  constraint follows_not_self check (follower_id <> followed_id)
);
create index if not exists follows_followed_idx on public.follows (followed_id);

create table if not exists public.user_badges (
  user_id uuid not null
    constraint user_badges_user_fk references auth.users(id) on delete cascade,
  code text not null,
  awarded_at timestamptz not null default now(),
  primary key (user_id, code)
);
create index if not exists user_badges_code_idx on public.user_badges (code);

create table if not exists public.activity (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null,
  kind text not null,
  text text not null,
  created_at timestamptz not null default now(),
  constraint activity_user_fk foreign key (user_id)
    references auth.users(id) on delete cascade
);
create index if not exists activity_user_created_idx
  on public.activity (user_id, created_at desc);

-- Equipped award codes, split by kind: {"b":[...],"f":[...],"t":[...]}
-- Server validates ownership + caps (5 badges / 10 flairs / 2 titles).
alter table public.users
  add column if not exists equips jsonb not null default '{"b":[],"f":[],"t":[]}'::jsonb;

alter table public.follows enable row level security;
alter table public.user_badges enable row level security;
alter table public.activity enable row level security;
