-- Tag the games published so far, so the gallery's filter chips aren't empty
-- on first load. Keyed by id (stable) rather than title.
update public.games set tags = array['arcade','shooter','action']
  where id = '2837cf3e-0157-41ac-8535-f81d2ad6d9b9';  -- Tank-Battles
update public.games set tags = array['arcade','classic']
  where id = '2cc7efff-035d-421e-8ab4-ffec1a9d9c3d';  -- Snake
update public.games set tags = array['arcade','classic','2-player']
  where id = 'c874bc99-8aa8-4a61-a70c-612e78423cb6';  -- Pong
update public.games set tags = array['idle','clicker']
  where id = '52f7678d-d16d-45e3-b695-41efd4e51345';  -- Clicker
update public.games set tags = array['arcade','classic']
  where id = 'fb5601e1-315d-4776-aa48-c6b191840751';  -- Breakout
update public.games set tags = array['arcade','endless','one-button']
  where id = '2ac7a3de-7df1-4e61-9e66-6394558c6d90';  -- Flap
update public.games set tags = array['puzzle','cards']
  where id = '90d47d21-10cc-4f04-9a11-9d5458854e17';  -- Memory