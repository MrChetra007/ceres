-- Phase 13 Feature 1b — Khmer localization.
-- Add a per-user preferred language so consult-ai and the ee-alerts-worker can
-- target the farmer's language (Khmer or English).
alter table profiles add column preferred_language text not null default 'en';

alter table profiles add constraint profiles_preferred_language_check
  check (preferred_language in ('en', 'km'));