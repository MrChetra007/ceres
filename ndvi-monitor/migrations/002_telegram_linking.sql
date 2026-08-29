-- ============================================================================
-- Migration: Telegram account linking — Phase 8.3
-- Adds to the schema from Phase 8.1 (link_codes, alerts_log, profiles).
-- Run this in the Supabase SQL editor.
-- ============================================================================

-- Atomic redeem: mark the code used AND set the profile's telegram_chat_id in
-- one security-definer RPC so the bot webhook (service_role) can do both without
-- a race between two separate statements. Only called by the edge function.
create or replace function public.redeem_link_code(
  code_input text,
  chat_id_input text,
  user_id_input uuid
) returns void as $$
begin
  -- sanity: the row must still be valid (not used, not expired)
  if not exists (
    select 1 from link_codes
    where code = code_input
      and user_id = user_id_input
      and used = false
      and expires_at > now()
  ) then
    raise exception 'code invalid or expired';
  end if;

  -- set the chat id on the profile (telegram_chat_id is unique, so a chat that
  -- is already linked to another user will violate the constraint here)
  update profiles set telegram_chat_id = chat_id_input where id = user_id_input;

  -- consume the code
  update link_codes set used = true where code = code_input;
end;
$$ language plpgsql security definer;

create or replace function public.protect_telegram_chat_id()
returns trigger as $$
begin
  if auth.uid() is not null
     and old.telegram_chat_id is distinct from new.telegram_chat_id
     and new.telegram_chat_id is not null then
    raise exception 'telegram_chat_id can only be set through the Telegram bot';
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_protect_telegram_chat_id on public.profiles;
create trigger trg_protect_telegram_chat_id
  before update on public.profiles
  for each row
  execute function public.protect_telegram_chat_id();

-- Guard: a logged-in user must NOT be able to set/overwrite telegram_chat_id
-- directly through the normal "update own profile" update (only the bot may set
-- it via redeem_link_chat, and the app only clears it to NULL on disconnect).
-- auth.uid() is NULL for service_role requests (the bot's edge function) and
-- non-NULL for logged-in users, so this allows the bot but blocks the user.
-- The `old ... is distinct from new.telegram_chat_id` check is important:
-- a PATCH that only touches other columns (e.g. preferred_language) leaves
-- telegram_chat_id unchanged, so NEW.telegram_chat_id still holds the linked
-- chat id — without the distinct check every profile update would be blocked.
create function public.prevent_direct_telegram_chat_id() returns trigger as $$
begin
  if auth.uid() is not null
     and old.telegram_chat_id is distinct from new.telegram_chat_id
     and new.telegram_chat_id is not null then
    raise exception 'telegram_chat_id can only be set through the Telegram bot';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists prevent_direct_telegram_chat_id on profiles;
create trigger prevent_direct_telegram_chat_id
  before update on profiles
  for each row execute procedure public.prevent_direct_telegram_chat_id();

-- Optional cleanup: drop expired link_codes older than 1 day (run on a schedule
-- or manually; harmless to leave).
create or replace function public.cleanup_expired_link_codes() returns int as $$
declare
  deleted int;
begin
  delete from link_codes
  where used = true or expires_at < now() - interval '1 day';
  get diagnostics deleted = row_count;
  return deleted;
end;
$$ language plpgsql security definer;


drop trigger if exists prevent_direct_telegram_chat_id on public.profiles;
drop function if exists prevent_direct_telegram_chat_id();