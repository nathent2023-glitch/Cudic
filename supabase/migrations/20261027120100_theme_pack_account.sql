ALTER TABLE public.users ADD COLUMN IF NOT EXISTS pack_slug TEXT;
UPDATE public.users SET pack_slug = NULL;
