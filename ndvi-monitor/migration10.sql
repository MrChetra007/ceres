-- Phase 13 Feature 2 — Ground-truth photo attachments (webhook part).
--
-- 1. A PRIVATE Supabase Storage bucket for field photos. Photos are read via
--    signed URLs generated server-side / RLS-respecting client calls; never
--    public.
insert into storage.buckets (id, name, public)
values ('field-photos', 'field-photos', false)
on conflict (id) do nothing;

-- When a photo arrives and the field can't be inferred unambiguously (multiple
-- recent alerts / multiple fields), the webhook parks a row here and replies
-- with an inline keyboard. The subsequent callback_query resolves which field
-- and then this row is consumed + deleted.
create table pending_photo (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  chat_id text not null,
  telegram_file_id text not null,
  telegram_file_path text,
  storage_path text not null,
  field_ids uuid[] not null default '{}',
  created_at timestamptz default now()
);

alter table pending_photo enable row level security;
-- service_role (from the webhook) manages these rows, so no client policy is
-- required; the bot itself acts on behalf of the logged-in owner.