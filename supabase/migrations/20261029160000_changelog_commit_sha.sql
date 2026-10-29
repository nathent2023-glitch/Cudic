-- Add commit_sha to changelog for dedup against git history / webhooks.
alter table public.changelog add column if not exists commit_sha text;
create unique index if not exists changelog_commit_sha_uidx
  on public.changelog (commit_sha) where commit_sha is not null;

-- The 12 hand-written entries are superseded by the commit backfill.
delete from public.changelog where commit_sha is null;
