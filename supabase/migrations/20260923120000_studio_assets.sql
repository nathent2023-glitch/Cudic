-- Studio binary assets manifest: { "logo.png": "game-assets/<gameId>/logo.png", ... }
-- Blobs live in the game-assets bucket; files JSON stays strings-only.
alter table public.games add column if not exists assets jsonb;
