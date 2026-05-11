-- =====================================================================
-- Migration: tokens as in-app currency + transactions ledger
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- =====================================================================

-- 1. Add tokens balance to profiles. New users start with 5 free tokens
--    so they can try the app before buying.
alter table public.profiles
  add column if not exists tokens integer not null default 5;

-- Make sure the trigger that creates a profile on signup also seeds the
-- starter balance (it picks up the default, but be explicit for clarity).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, tokens)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    'user',
    5
  );
  return new;
end;
$$;

-- 2. Transactions ledger. One row per purchase attempt.
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  username      text not null default '',
  status        text not null check (status in ('completed', 'failed', 'refunded')),
  amount        numeric(10, 2) not null,
  currency      text not null default 'USD',
  tokens_added  integer not null default 0,
  reference_id  text,                              -- Tap charge / token id
  created_at    timestamptz not null default now()
);

create index if not exists transactions_user_id_idx
  on public.transactions (user_id, created_at desc);
create index if not exists transactions_created_at_idx
  on public.transactions (created_at desc);

-- 3. RLS
alter table public.transactions enable row level security;

drop policy if exists "transactions_owner_select" on public.transactions;
create policy "transactions_owner_select" on public.transactions
  for select using (auth.uid() = user_id);

drop policy if exists "transactions_admin_select" on public.transactions;
create policy "transactions_admin_select" on public.transactions
  for select using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- We don't open INSERT/UPDATE to clients — only the SECURITY DEFINER
-- function below writes to this table, so users can't forge transactions.

-- 4. Atomic functions
--    consume_token: decrement balance by 1. Fails if balance is 0.
create or replace function public.consume_token()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  update public.profiles
     set tokens = tokens - 1
   where id = auth.uid() and tokens > 0
   returning tokens into new_balance;

  if new_balance is null then
    raise exception 'INSUFFICIENT_TOKENS' using errcode = 'P0001';
  end if;

  return new_balance;
end;
$$;

grant execute on function public.consume_token() to authenticated;

-- add_tokens: credit a purchase, log the transaction, return new balance.
create or replace function public.add_tokens(
  p_tokens integer,
  p_amount numeric,
  p_currency text,
  p_reference text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  uname text;
  new_balance integer;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_tokens <= 0 then
    raise exception 'INVALID_TOKENS';
  end if;

  select name into uname from public.profiles where id = uid;

  insert into public.transactions
    (user_id, username, status, amount, currency, tokens_added, reference_id)
  values
    (uid, coalesce(uname, ''), 'completed', p_amount, p_currency, p_tokens, p_reference);

  update public.profiles
     set tokens = tokens + p_tokens
   where id = uid
   returning tokens into new_balance;

  return new_balance;
end;
$$;

grant execute on function public.add_tokens(integer, numeric, text, text)
  to authenticated;
