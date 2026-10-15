-- Onboarding completion flag for the welcome wizard.
-- Grandfathered true for everyone who exists now (they signed up before
-- the wizard); new signups default false until they finish it.
-- Run in Supabase SQL Editor, like the other migrations.

alter table public.users
  add column if not exists setup_done boolean not null default false;

update public.users set setup_done = true where setup_done = false;
