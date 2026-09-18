-- Run this SQL in your Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- Users table (auto-populated by Supabase Auth)
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id bigint unique,  -- unique numeric ID, immutable
  display_name text not null,
  avatar_url text,
  created_at timestamptz default now()
);

-- Sequence for unique numeric user IDs
create sequence if not exists public.user_id_seq start 1000;

-- Auto-create user profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, user_id, display_name, avatar_url)
  values (
    new.id,
    nextval('public.user_id_seq'),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', null)
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lobbies table
create table if not exists public.lobbies (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_by uuid references public.users(id),
  persistent boolean default false,
  created_at timestamptz default now()
);

-- Messages table
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  display_name text not null,
  text text not null,
  created_at timestamptz default now()
);

-- Index for fast message loading
create index if not exists messages_lobby_created_idx on public.messages (lobby_id, created_at);

-- Row Level Security (optional, for direct client queries)
alter table public.messages enable row level security;
alter table public.lobbies enable row level security;

-- Allow anyone to read messages
create policy "Anyone can read messages" on public.messages for select using (true);
-- Allow authenticated users to insert messages
create policy "Authenticated users can insert messages" on public.messages for insert with check (auth.role() = 'authenticated');
-- Allow anyone to read lobbies
create policy "Anyone can read lobbies" on public.lobbies for select using (true);
-- Allow authenticated users to create lobbies
create policy "Authenticated users can create lobbies" on public.lobbies for insert with check (auth.role() = 'authenticated');

-- Games table
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text default '',
  credits text default '',
  scene jsonb not null default '[]'::jsonb,
  thumbnail text,
  published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists games_owner_idx on public.games (owner_id);
create index if not exists games_published_idx on public.games (published) where published = true;

alter table public.games enable row level security;
create policy "Anyone can read published games" on public.games for select using (published = true);
create policy "Owners can read own games" on public.games for select using (auth.uid() = owner_id);
create policy "Owners can update own games" on public.games for update using (auth.uid() = owner_id);
create policy "Owners can delete own games" on public.games for delete using (auth.uid() = owner_id);
create policy "Authenticated users can create games" on public.games for insert with check (auth.uid() = owner_id);

-- ── Add user_id to existing users (run if table already exists) ──
-- ALTER TABLE public.users ADD COLUMN IF NOT EXISTS user_id bigint unique;
-- CREATE SEQUENCE IF NOT EXISTS public.user_id_seq START 1000;
-- UPDATE public.users SET user_id = nextval('public.user_id_seq') WHERE user_id IS NULL;

-- ── Servers (group chats) ───────────────────────────────────────────
-- Servers are owned lobbies with extra metadata. Max 3 per user.
create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text default '',
  icon_url text,
  visibility text default 'public' check (visibility in ('public','private')),
  invite_code text unique not null default substr(md5(random()::text),1,8),
  owner_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz default now()
);

create table if not exists public.server_members (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz default now(),
  unique(server_id, user_id)
);

alter table public.servers enable row level security;
alter table public.server_members enable row level security;

create policy "Anyone can read public servers" on public.servers for select using (visibility = 'public' or auth.uid() = owner_id);
create policy "Members can read private servers" on public.servers for select using (
  exists (select 1 from public.server_members where server_members.server_id = servers.id and server_members.user_id = auth.uid())
);
create policy "Authenticated can create servers" on public.servers for insert with check (auth.uid() = owner_id);
create policy "Owners can update own servers" on public.servers for update using (auth.uid() = owner_id);
create policy "Owners can delete own servers" on public.servers for delete using (auth.uid() = owner_id);

create policy "Members can read server_members" on public.server_members for select using (true);
create policy "Authenticated can join servers" on public.server_members for insert with check (auth.uid() = user_id);

-- Fix handle_new_user to be safe
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, user_id, display_name, avatar_url)
  values (
    new.id,
    nextval('public.user_id_seq'),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', null)
  );
  return new;
end;
$$;

-- Ensure trigger exists
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
