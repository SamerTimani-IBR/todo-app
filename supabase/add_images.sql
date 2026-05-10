-- =====================================================================
-- Migration: add image attachments to todos
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- =====================================================================

-- 1. Add the new column
alter table public.todos
  add column if not exists image_url text;

-- 2. Create a public storage bucket for todo images.
--    public=true means the file is reachable via a plain URL (no signed URL needed).
--    file_size_limit is in bytes (5 MB here).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'todo-images',
  'todo-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3. Storage policies.
--    Files are stored under "<user-id>/<filename>" so each user has their own folder.

drop policy if exists "todo_images_public_read" on storage.objects;
create policy "todo_images_public_read" on storage.objects
  for select
  using (bucket_id = 'todo-images');

drop policy if exists "todo_images_owner_insert" on storage.objects;
create policy "todo_images_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'todo-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "todo_images_owner_delete" on storage.objects;
create policy "todo_images_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'todo-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
