-- Chat rebuild: servers have channels, DMs are 1:1, everything persistent.
-- Legacy free-standing rooms (welcome, hello, ad-hoc) are deleted with
-- their messages. Server rooms (server:<uuid>) become #general channels.

-- 1. Shape columns on lobbies (kind is filled in below, then constrained)
alter table public.lobbies
  add column if not exists server_id uuid references public.servers(id) on delete cascade,
  add column if not exists topic text not null default '',
  add column if not exists is_private boolean not null default false,
  add column if not exists kind text;

-- 2. Roles on server_members (owner backfilled; moderator skipped for now)
alter table public.server_members
  add column if not exists role text not null default 'member';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'server_members_role_check') then
    alter table public.server_members
      add constraint server_members_role_check check (role in ('owner','member'));
  end if;
end $$;

update public.server_members sm
set role = 'owner'
from public.servers s
where s.id = sm.server_id and s.owner_id = sm.user_id and sm.role <> 'owner';

-- 3. New tables: access, read receipts, friends
create table if not exists public.conversation_members (
  user_id uuid not null references public.users(id) on delete cascade,
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (user_id, lobby_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

create table if not exists public.conversation_state (
  user_id uuid not null references public.users(id) on delete cascade,
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  last_read_at timestamptz,
  primary key (user_id, lobby_id)
);
create index if not exists conversation_state_user_idx on public.conversation_state (user_id);

create table if not exists public.friendships (
  user_id uuid not null references public.users(id) on delete cascade,
  friend_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz default now(),
  primary key (user_id, friend_id)
);
create index if not exists friendships_friend_idx on public.friendships (friend_id, status);

-- 4. Backfill: server rooms whose server still exists become #general channels
update public.lobbies l
set name = 'chan:' || s.id::text || ':general',
    kind = 'channel',
    server_id = s.id
from public.servers s
where l.name = 'server:' || s.id::text;

-- 5. Everything left without a kind is a legacy free room: label, then delete
update public.lobbies set kind = 'room' where kind is null;
delete from public.lobbies where kind = 'room';

-- 6. From now on only channels and DMs can exist
alter table public.lobbies alter column kind set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lobbies_kind_check') then
    alter table public.lobbies
      add constraint lobbies_kind_check check (kind in ('channel','dm'));
  end if;
end $$;
create index if not exists lobbies_server_idx on public.lobbies (server_id);

-- 7. RLS: server code uses the service key (bypasses RLS); these policies are
-- the backstop for direct client access. Accept/decline/remove go through
-- the API only, so there are deliberately no update/delete policies here.
alter table public.conversation_members enable row level security;
alter table public.conversation_state enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "Members can read own membership" on public.conversation_members;
create policy "Members can read own membership" on public.conversation_members
  for select using (auth.uid() = user_id);
drop policy if exists "Users can manage own membership" on public.conversation_members;
create policy "Users can manage own membership" on public.conversation_members
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can read own read-state" on public.conversation_state;
create policy "Users can read own read-state" on public.conversation_state
  for select using (auth.uid() = user_id);
drop policy if exists "Users can write own read-state" on public.conversation_state;
create policy "Users can write own read-state" on public.conversation_state
  for insert with check (auth.uid() = user_id);

drop policy if exists "Users can read own friendships" on public.friendships;
create policy "Users can read own friendships" on public.friendships
  for select using (auth.uid() = user_id or auth.uid() = friend_id);
drop policy if exists "Users can request friendships" on public.friendships;
create policy "Users can request friendships" on public.friendships
  for insert with check (auth.uid() = user_id);
