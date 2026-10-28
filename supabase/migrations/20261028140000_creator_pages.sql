-- Creator page customization (structured + custom CSS, no scripts)
create table if not exists public.creator_pages (
  user_id uuid primary key references public.users(id) on delete cascade,
  accent text check (accent ~ '^#[0-9a-fA-F]{6}$'),
  banner_url text not null default '',
  pinned_game_id uuid references public.games(id) on delete set null,
  links jsonb not null default '[]'::jsonb,
  show_games boolean not null default true,
  show_packs boolean not null default true,
  show_comments boolean not null default true,
  custom_css text not null default '',
  updated_at timestamptz not null default now()
);
