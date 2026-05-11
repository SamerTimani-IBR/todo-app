-- =====================================================================
-- Admin-only data: aggregate stats + users list.
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- =====================================================================

-- 1. admin_get_stats()
--    Returns a JSON object with high-level numbers for the admin dashboard.
create or replace function public.admin_get_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'NOT_ADMIN' using errcode = 'P0001';
  end if;

  select json_build_object(
    'user_count',
      (select count(*) from public.profiles where role = 'user'),
    'todo_count',
      (select count(*) from public.todos),
    'completed_todo_count',
      (select count(*) from public.todos where completed = true),
    'tokens_in_circulation',
      (select coalesce(sum(tokens), 0) from public.profiles where role = 'user'),
    'transactions_today',
      (select count(*) from public.transactions
        where created_at >= date_trunc('day', now())),
    'revenue_today',
      (select coalesce(sum(amount), 0) from public.transactions
        where status = 'completed' and created_at >= date_trunc('day', now())),
    'revenue_total',
      (select coalesce(sum(amount), 0) from public.transactions
        where status = 'completed')
  ) into result;

  return result;
end;
$$;

grant execute on function public.admin_get_stats() to authenticated;

-- 2. admin_get_users()
--    Returns a JSON array — one element per user — with profile, email,
--    todo count and total spent. Using JSON avoids the "column reference X
--    is ambiguous" trap that bites RETURNS TABLE when an OUT parameter
--    shares a name with a real column.
--
--    DROP first because PostgreSQL won't let CREATE OR REPLACE change a
--    function's return type from TABLE(...) to json.
drop function if exists public.admin_get_users();

create or replace function public.admin_get_users()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'NOT_ADMIN' using errcode = 'P0001';
  end if;

  select coalesce(
    json_agg(
      json_build_object(
        'id',          p.id,
        'email',       u.email,
        'name',        p.name,
        'role',        p.role,
        'tokens',      p.tokens,
        'created_at',  p.created_at,
        'todos_count',
          (select count(*) from public.todos t where t.user_id = p.id),
        'total_spent',
          coalesce(
            (select sum(amount) from public.transactions tx
              where tx.user_id = p.id and tx.status = 'completed'),
            0
          )
      )
      order by p.created_at desc
    ),
    '[]'::json
  )
  into result
  from public.profiles p
  join auth.users u on u.id = p.id;

  return result;
end;
$$;

grant execute on function public.admin_get_users() to authenticated;
