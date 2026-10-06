-- Visible, unremovable remix credit (Scratch-style): every fork records its
-- parent plus a title snapshot. The fork endpoint always sets both; the
-- update endpoint has an explicit field allowlist without them, so no owner
-- (original or remixer) can strip the credit through the API.
-- Parent deleted -> forked_from nulls out but the snapshot title stays, so
-- the line degrades to plain text instead of vanishing.
alter table public.games
  add column if not exists forked_from uuid references public.games(id) on delete set null;
alter table public.games
  add column if not exists forked_from_title text not null default '';
create index if not exists games_forked_from_idx on public.games (forked_from);
