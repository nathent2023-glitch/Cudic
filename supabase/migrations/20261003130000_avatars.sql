-- Public avatars bucket (profile pictures; clients downscale to ≤1000px JPEG).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Anyone can read avatars" on storage.objects;
create policy "Anyone can read avatars" on storage.objects
  for select using (bucket_id = 'avatars');
drop policy if exists "Authenticated can upload avatars" on storage.objects;
create policy "Authenticated can upload avatars" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
drop policy if exists "Owners can manage own avatars" on storage.objects;
create policy "Owners can manage own avatars" on storage.objects
  for update using (bucket_id = 'avatars' and owner_id = auth.uid()::text);
drop policy if exists "Owners can delete own avatars" on storage.objects;
create policy "Owners can delete own avatars" on storage.objects
  for delete using (bucket_id = 'avatars' and owner_id = auth.uid()::text);
