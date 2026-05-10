-- =====================================================================
-- Enable Realtime broadcasts on the word_of_day table.
-- Run once in: Supabase Dashboard → SQL Editor → New query
-- =====================================================================

-- Add the table to the supabase_realtime publication so postgres_changes
-- events are sent to subscribed clients. If it's already added, this is a no-op.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'word_of_day'
  ) then
    execute 'alter publication supabase_realtime add table public.word_of_day';
  end if;
end $$;

-- Make sure full row data is sent on UPDATE (instead of just changed columns).
alter table public.word_of_day replica identity full;
