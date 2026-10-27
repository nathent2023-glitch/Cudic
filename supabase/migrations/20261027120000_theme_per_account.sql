-- Theme preference stored per account (replaces client-only localStorage key)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'dark';
-- Default existing rows to dark so the site stays consistent with its current default
UPDATE public.users SET theme = 'dark' WHERE theme IS NULL;
