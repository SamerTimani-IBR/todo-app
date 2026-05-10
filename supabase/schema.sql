-- =====================================================================
-- Todo App — Supabase schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- =====================================================================

-- ---------- profiles ----------
-- Extends auth.users with name + role.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null default '',
  role       text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    'user'  -- new signups are always 'user'; admins are promoted manually
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- todos ----------
create table if not exists public.todos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null,
  note       text not null default '',
  completed  boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists todos_user_id_created_at_idx
  on public.todos (user_id, created_at desc);

-- ---------- word_of_day ----------
-- Singleton row (id always = 1).
create table if not exists public.word_of_day (
  id         int primary key default 1 check (id = 1),
  message    text not null default '',
  updated_by text not null default 'Admin',
  updated_at timestamptz not null default now()
);

insert into public.word_of_day (id, message)
values (1, '')
on conflict (id) do nothing;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles    enable row level security;
alter table public.todos       enable row level security;
alter table public.word_of_day enable row level security;

-- profiles: a user can read + update their own row
drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles
  for update using (auth.uid() = id);

-- todos: only the owner can do anything with their todos
drop policy if exists "todos_owner_select" on public.todos;
create policy "todos_owner_select" on public.todos
  for select using (auth.uid() = user_id);

drop policy if exists "todos_owner_insert" on public.todos;
create policy "todos_owner_insert" on public.todos
  for insert with check (auth.uid() = user_id);

drop policy if exists "todos_owner_update" on public.todos;
create policy "todos_owner_update" on public.todos
  for update using (auth.uid() = user_id);

drop policy if exists "todos_owner_delete" on public.todos;
create policy "todos_owner_delete" on public.todos
  for delete using (auth.uid() = user_id);

-- word_of_day: any logged-in user can read; only admin can update
drop policy if exists "word_read_authenticated" on public.word_of_day;
create policy "word_read_authenticated" on public.word_of_day
  for select using (auth.role() = 'authenticated');

drop policy if exists "word_update_admin" on public.word_of_day;
create policy "word_update_admin" on public.word_of_day
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );
