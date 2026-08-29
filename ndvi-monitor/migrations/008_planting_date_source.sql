-- Data Trust Layer (Part B): track how the planting date was set so the
-- confidence badge can distinguish a farmer-confirmed date from an
-- auto-estimated one (Phase 13 Feature 3 will write 'estimated').
alter table fields add column planting_date_source text not null default 'manual';

alter table fields add constraint fields_planting_date_source_check
  check (planting_date_source in ('manual', 'estimated'));
