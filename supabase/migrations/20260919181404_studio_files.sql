-- Studio projects: multi-file websites/games.
-- files: { "index.html": "...", "style.css": "...", "main.js": "..." }
alter table public.games add column if not exists files jsonb;

-- Game assets bucket (images, audio, models referenced by projects)
insert into storage.buckets (id, name, public)
values ('game-assets', 'game-assets', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can read game assets" on storage.objects;
create policy "Anyone can read game assets" on storage.objects
  for select using (bucket_id = 'game-assets');
drop policy if exists "Authenticated can upload game assets" on storage.objects;
create policy "Authenticated can upload game assets" on storage.objects
  for insert with check (bucket_id = 'game-assets' and auth.role() = 'authenticated');
drop policy if exists "Owners can manage own game assets" on storage.objects;
create policy "Owners can manage own game assets" on storage.objects
  for update using (bucket_id = 'game-assets' and owner_id = auth.uid()::text);
drop policy if exists "Owners can delete own game assets" on storage.objects;
create policy "Owners can delete own game assets" on storage.objects
  for delete using (bucket_id = 'game-assets' and owner_id = auth.uid()::text);
