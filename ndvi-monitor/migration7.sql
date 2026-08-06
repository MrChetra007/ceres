create table field_photos (
  id uuid primary key default gen_random_uuid(),
  field_id uuid references fields(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  storage_path text not null,
  alert_log_id uuid references alerts_log(id),
  caption text,
  created_at timestamptz default now()
);

alter table field_photos enable row level security;
create policy "owners can read their own photos" on field_photos
  for select using (auth.uid() = owner_id);
-- inserts happen via service_role from the Edge Function, not directly from the client