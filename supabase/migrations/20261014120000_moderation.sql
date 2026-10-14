-- Moderation queue (plan.md 2.2): moderator allowlist + audit history.
-- RLS enabled with deliberately no policies: service key only, like
-- game_likes. Every read and write goes through server.js auth checks.
-- To make yourself a moderator, insert your Supabase auth UUID
-- (Dashboard → Authentication → Users → UID, not the numeric cudic id):
--   insert into public.moderators (user_id) values ('<your-auth-uuid>');

create table if not exists public.moderators (
  user_id uuid primary key references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references public.users(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  content_type text not null,
  content_id uuid,
  action text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists moderation_actions_content_idx
  on public.moderation_actions (content_type, content_id, created_at desc);
create index if not exists moderation_actions_report_idx
  on public.moderation_actions (report_id);

alter table public.moderators enable row level security;
alter table public.moderation_actions enable row level security;
