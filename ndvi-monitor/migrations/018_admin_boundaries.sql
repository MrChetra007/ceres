-- 018_admin_boundaries.sql
-- Official Cambodia administrative boundaries (DataEF, 2025 lists).
-- Codes are TEXT with leading zeros; each level's code starts with its parent's.
-- NOTE: the repo already has two 016_* files and 017 is used by
-- 017_ee_data_keep_warm.sql, so this migration takes 018. The next free
-- number for the roles/commune-summary migration is 019.

create table if not exists admin_provinces (
  code text primary key,
  name_kh text not null,
  name_en text not null
);

create table if not exists admin_districts (
  code text primary key,
  province_code text not null references admin_provinces(code),
  name_kh text not null,
  name_en text not null
);

create table if not exists admin_communes (
  code text primary key,
  district_code text not null references admin_districts(code),
  province_code text not null references admin_provinces(code),
  name_kh text not null,
  name_en text not null
);

create table if not exists admin_villages (
  code text primary key,
  commune_code text not null references admin_communes(code),
  district_code text not null references admin_districts(code),
  province_code text not null references admin_provinces(code),
  name_kh text not null,
  name_en text not null
);

create index if not exists admin_districts_province_idx on admin_districts(province_code);
create index if not exists admin_communes_district_idx on admin_communes(district_code);
create index if not exists admin_villages_commune_idx on admin_villages(commune_code);

-- Public reference data: readable by any signed-in user, writable only by service role.
alter table admin_provinces enable row level security;
alter table admin_districts enable row level security;
alter table admin_communes enable row level security;
alter table admin_villages enable row level security;

drop policy if exists "authenticated read provinces" on admin_provinces;
drop policy if exists "authenticated read districts" on admin_districts;
drop policy if exists "authenticated read communes" on admin_communes;
drop policy if exists "authenticated read villages" on admin_villages;

create policy "authenticated read provinces" on admin_provinces for select to authenticated using (true);
create policy "authenticated read districts" on admin_districts for select to authenticated using (true);
create policy "authenticated read communes" on admin_communes for select to authenticated using (true);
create policy "authenticated read villages" on admin_villages for select to authenticated using (true);

-- Tag each field with its official location + sharing consent.
alter table fields
  add column if not exists province_code text references admin_provinces(code),
  add column if not exists district_code text references admin_districts(code),
  add column if not exists commune_code text references admin_communes(code),
  add column if not exists village_code text references admin_villages(code),
  add column if not exists share_with_authorities boolean not null default false;

create index if not exists fields_commune_idx on fields(commune_code);
