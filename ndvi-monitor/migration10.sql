-- 1. Create field_photos table
create table if not exists public.field_photos (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references public.fields(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);

alter table public.field_photos enable row level security;

-- 2. RLS on field_photos — owner can read/write their own field's photos
drop policy if exists "field_photos_owner_select" on public.field_photos;
create policy "field_photos_owner_select" on public.field_photos
  for select using (owner_id = auth.uid());

drop policy if exists "field_photos_owner_insert" on public.field_photos;
create policy "field_photos_owner_insert" on public.field_photos
  for insert with check (owner_id = auth.uid());

drop policy if exists "field_photos_owner_delete" on public.field_photos;
create policy "field_photos_owner_delete" on public.field_photos
  for delete using (owner_id = auth.uid());

-- 3. RLS on pending_photo (currently has none)
alter table public.pending_photo enable row level security;

drop policy if exists "pending_photo_owner_select" on public.pending_photo;
create policy "pending_photo_owner_select" on public.pending_photo
  for select using (owner_id = auth.uid());

drop policy if exists "pending_photo_owner_all" on public.pending_photo;
create policy "pending_photo_owner_all" on public.pending_photo
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 4. Storage policies on the field-photos bucket (path convention: {owner_id}/{ts}.jpg)
drop policy if exists "field_photos_storage_select" on storage.objects;
create policy "field_photos_storage_select" on storage.objects
  for select using (
    bucket_id = 'field-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "field_photos_storage_insert" on storage.objects;
create policy "field_photos_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'field-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

  alter table alerts_log add column if not exists telegram_sent boolean default null;
alter table ai_explanations add column if not exists truncated boolean default null;