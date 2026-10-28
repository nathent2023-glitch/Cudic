-- Game slugs: pretty shareable URLs (/g/snake instead of /g/<uuid>)
alter table public.games add column if not exists slug text;

create unique index if not exists games_slug_key
  on public.games (slug) where slug is not null;
