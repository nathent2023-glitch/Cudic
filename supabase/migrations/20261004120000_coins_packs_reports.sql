-- Community theme packs + virtual coins + reports.
-- Coins: balance on users, append-only ledger, atomic grant/spend RPCs
-- (service_role only; no direct client writes).
-- Packs: user-authored manifests, ownership, gated serving via API.
-- Reports: reason-required, optional evidence, manual review.

-- 1. Coin balance -------------------------------------------------------
alter table public.users
  add column if not exists balance integer not null default 0;

-- 2. Coin ledger --------------------------------------------------------
create table if not exists public.coin_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  delta integer not null,
  reason text not null,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists coin_ledger_user_created
  on public.coin_ledger (user_id, created_at desc);

alter table public.coin_ledger enable row level security;
drop policy if exists "Users can read own ledger" on public.coin_ledger;
create policy "Users can read own ledger" on public.coin_ledger
  for select using (user_id = auth.uid());

-- 3. Atomic grant / spend (service_role only) ---------------------------
create or replace function public.grant_coins(
  p_user uuid, p_delta integer, p_reason text, p_ref uuid default null
)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_bal integer;
begin
  if p_delta <= 0 then raise exception 'delta must be positive'; end if;
  update public.users set balance = balance + p_delta
    where id = p_user returning balance into v_bal;
  if not found then raise exception 'no such user'; end if;
  insert into public.coin_ledger (user_id, delta, reason, ref_id)
    values (p_user, p_delta, p_reason, p_ref);
  return v_bal;
end $$;

create or replace function public.spend_coins(
  p_user uuid, p_delta integer, p_reason text, p_ref uuid default null
)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_bal integer;
begin
  if p_delta <= 0 then raise exception 'delta must be positive'; end if;
  update public.users set balance = balance - p_delta
    where id = p_user returning balance into v_bal;
  if not found then raise exception 'no such user'; end if;
  if v_bal < 0 then raise exception 'insufficient funds'; end if;
  insert into public.coin_ledger (user_id, delta, reason, ref_id)
    values (p_user, -p_delta, p_reason, p_ref);
  return v_bal;
end $$;

revoke all on function public.grant_coins(uuid, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.spend_coins(uuid, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.grant_coins(uuid, integer, text, uuid) to service_role;
grant execute on function public.spend_coins(uuid, integer, text, uuid) to service_role;

-- 4. Community theme packs ----------------------------------------------
create table if not exists public.theme_packs (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  manifest jsonb not null default '{}'::jsonb,
  price integer not null default 0 check (price >= 0),
  downloads integer not null default 0,
  featured boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists theme_packs_published_created
  on public.theme_packs (published, created_at desc);

alter table public.theme_packs enable row level security;
drop policy if exists "Anyone can read published packs" on public.theme_packs;
create policy "Anyone can read published packs" on public.theme_packs
  for select using (published = true);
drop policy if exists "Owners can read own packs" on public.theme_packs;
create policy "Owners can read own packs" on public.theme_packs
  for select using (owner_id = auth.uid());

-- 5. Pack ownership (paid packs) -----------------------------------------
create table if not exists public.pack_ownership (
  user_id uuid not null references public.users(id) on delete cascade,
  pack_id uuid not null references public.theme_packs(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, pack_id)
);

alter table public.pack_ownership enable row level security;
drop policy if exists "Users can read own pack ownership" on public.pack_ownership;
create policy "Users can read own pack ownership" on public.pack_ownership
  for select using (user_id = auth.uid());

-- 6. Reports -------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  content_type text not null,
  content_id uuid not null,
  reason text not null,
  details text not null default '',
  evidence_url text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);
create index if not exists reports_status_created
  on public.reports (status, created_at desc);

alter table public.reports enable row level security;
drop policy if exists "Users can read own reports" on public.reports;
create policy "Users can read own reports" on public.reports
  for select using (reporter_id = auth.uid());

-- 7. Storage: pack-assets (public) + report-evidence (private) -----------
insert into storage.buckets (id, name, public)
values ('pack-assets', 'pack-assets', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can read pack assets" on storage.objects;
create policy "Anyone can read pack assets" on storage.objects
  for select using (bucket_id = 'pack-assets');
drop policy if exists "Authenticated can upload pack assets" on storage.objects;
create policy "Authenticated can upload pack assets" on storage.objects
  for insert with check (bucket_id = 'pack-assets' and auth.role() = 'authenticated');
drop policy if exists "Owners can manage own pack assets" on storage.objects;
create policy "Owners can manage own pack assets" on storage.objects
  for update using (bucket_id = 'pack-assets' and owner_id = auth.uid()::text);
drop policy if exists "Owners can delete own pack assets" on storage.objects;
create policy "Owners can delete own pack assets" on storage.objects
  for delete using (bucket_id = 'pack-assets' and owner_id = auth.uid()::text);

insert into storage.buckets (id, name, public)
values ('report-evidence', 'report-evidence', false)
on conflict (id) do nothing;

drop policy if exists "Authenticated can upload report evidence" on storage.objects;
create policy "Authenticated can upload report evidence" on storage.objects
  for insert with check (bucket_id = 'report-evidence' and auth.role() = 'authenticated');
drop policy if exists "Uploaders can read own report evidence" on storage.objects;
create policy "Uploaders can read own report evidence" on storage.objects
  for select using (bucket_id = 'report-evidence' and owner_id = auth.uid()::text);
