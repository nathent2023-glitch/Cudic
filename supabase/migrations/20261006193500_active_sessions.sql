-- One live seat per account. The client generates a random seat id at login
-- (stored in localStorage) and heartbeats it; a different fresh seat means
-- another device took over. Tabs in one browser share a login and coordinate
-- among themselves client-side. Stale rows (>90s) are dead — laptop sleep
-- frees the seat automatically. No backfill: rows are created lazily, and
-- "no row" means free pass so the deploy never surprise-kicks anyone.
create table if not exists public.active_sessions (
  user_id uuid primary key references public.users(id) on delete cascade,
  seat_id text not null,
  heartbeat_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists active_sessions_heartbeat_idx
  on public.active_sessions (heartbeat_at);

alter table public.active_sessions enable row level security;
-- Deliberately no policies: only the service key touches this table.
-- (An authenticated client policy here would let any signed-in user read or
-- squat anyone's seat row.)
