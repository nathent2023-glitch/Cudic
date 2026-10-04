-- Server rules screening: optional rules text per server; members must
-- explicitly accept before they can see or talk. Existing members are
-- grandfathered in (they joined before rules existed).
alter table public.servers
  add column if not exists rules text not null default '';
alter table public.server_members
  add column if not exists rules_accepted_at timestamptz;
update public.server_members
set rules_accepted_at = now()
where rules_accepted_at is null;
