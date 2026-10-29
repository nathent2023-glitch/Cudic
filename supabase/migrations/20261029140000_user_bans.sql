-- Per-user, time-limited bans (currently chat/messaging). Moderators
-- create and lift them; enforcement lives in server.js (WS send + comment
-- POST). RLS on, no policies — service-role only.
create table if not exists public.user_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null,
  banned_until timestamptz not null,
  reason text not null default '',
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists user_bans_user_kind_idx
  on public.user_bans (user_id, kind, banned_until desc);

alter table public.user_bans enable row level security;
