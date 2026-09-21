-- Deleting a user no longer fails when they created lobbies.
-- Lobbies survive (creator cleared), matching messages.user_id behavior.
alter table public.lobbies
  drop constraint lobbies_created_by_fkey,
  add constraint lobbies_created_by_fkey
  foreign key (created_by) references public.users(id) on delete set null;
