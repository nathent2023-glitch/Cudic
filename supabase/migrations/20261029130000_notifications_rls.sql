-- Notifications had RLS off: with no policies and the public anon key
-- published in config.js, anyone could read or forge any inbox through
-- PostgREST. The platform reads/writes it with the service key only,
-- so lock it the same way as active_sessions: RLS on, zero policies.
alter table public.notifications enable row level security;
