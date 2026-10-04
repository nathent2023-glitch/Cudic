-- Reports can target the built-in static packs too, which have slugs
-- but no theme_packs row: allow slug-addressed reports.
alter table public.reports
  add column if not exists content_slug text;
alter table public.reports
  alter column content_id drop not null;
