-- =====================================================================
-- Add RPC for recording failed payment attempts.
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- =====================================================================

-- Inserts a "failed" row into transactions so admins can audit declines.
-- The Edge Function calls this when Tap returns DECLINED / EXPIRED / etc.
create or replace function public.record_failed_transaction(
  p_amount numeric,
  p_currency text,
  p_reference text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  uname text;
  reason_safe text;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select name into uname from public.profiles where id = uid;

  -- We don't have a column for the failure reason, so prefix it onto the
  -- reference id. This keeps the schema unchanged while still giving admins
  -- visibility into why each transaction failed in the CSV export.
  reason_safe := coalesce(p_reason, '');
  insert into public.transactions
    (user_id, username, status, amount, currency, tokens_added, reference_id)
  values
    (uid, coalesce(uname, ''),
     'failed', p_amount, p_currency, 0,
     case when reason_safe <> '' then reason_safe || ' · ' || coalesce(p_reference, '')
          else coalesce(p_reference, '') end);
end;
$$;

grant execute on function public.record_failed_transaction(numeric, text, text, text)
  to authenticated;
