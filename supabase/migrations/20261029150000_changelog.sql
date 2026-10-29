-- Public update log (changelog). Moderators post entries; everyone reads.
-- RLS on, no policies — service-role only.
create table if not exists public.changelog (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'feature',
  title text not null,
  body text not null default '',
  author_id uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists changelog_created_idx on public.changelog (created_at desc);

alter table public.changelog enable row level security;
