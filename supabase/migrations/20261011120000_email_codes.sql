-- Magic email codes (6-digit, SHA-256 hashed). One live code per email.
-- Service role only; RLS locked with no public policies. Rows are
-- short-lived (10 minutes) and deleted on verify, expiry, or resend.
create table if not exists public.email_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.email_codes enable row level security;
