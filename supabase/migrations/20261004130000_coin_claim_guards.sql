-- Backs the once-only rule for quest + daily coin claims against
-- double-clicks from two tabs: the second concurrent grant hits this
-- index, its transaction rolls back, and the server reports
-- already-claimed instead of paying twice.
create unique index if not exists coin_ledger_once_per_reason
  on public.coin_ledger (user_id, reason)
  where reason like 'quest:%' or reason like 'daily:%';
