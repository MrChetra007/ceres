-- Verify which seed files are present in Supabase.
-- Run this in the SQL editor. Status:
--   OK       = every row from that file exists
--   PARTIAL  = some rows exist
--   MISSING  = no rows from that file
--   EXTRA    = more rows than expected in this code range

with checks as (
  select '001_admin_provinces.sql' as seed_file, 25 as expected, (select count(*) from admin_provinces where code between '01' and '25') as actual
  union all
  select '002_admin_districts.sql' as seed_file, 210 as expected, (select count(*) from admin_districts where code between '0102' and '2507') as actual
  union all
  select '003_admin_communes_01.sql' as seed_file, 500 as expected, (select count(*) from admin_communes where code between '010201' and '060802') as actual
  union all
  select '003_admin_communes_02.sql' as seed_file, 500 as expected, (select count(*) from admin_communes where code between '060803' and '140105') as actual
  union all
  select '003_admin_communes_03.sql' as seed_file, 500 as expected, (select count(*) from admin_communes where code between '140106' and '210603') as actual
  union all
  select '003_admin_communes_04.sql' as seed_file, 161 as expected, (select count(*) from admin_communes where code between '210604' and '250714') as actual
  union all
  select '004_admin_villages_01.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '01020101' and '01070603') as actual
  union all
  select '004_admin_villages_02.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '01070605' and '02050403') as actual
  union all
  select '004_admin_villages_03.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '02050404' and '03010101') as actual
  union all
  select '004_admin_villages_04.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '03010102' and '03080102') as actual
  union all
  select '004_admin_villages_05.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '03080103' and '04010908') as actual
  union all
  select '004_admin_villages_06.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '04011001' and '04080710') as actual
  union all
  select '004_admin_villages_07.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '04080711' and '05031113') as actual
  union all
  select '004_admin_villages_08.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '05031114' and '05071401') as actual
  union all
  select '004_admin_villages_09.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '05071402' and '06020602') as actual
  union all
  select '004_admin_villages_10.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '06020603' and '06081007') as actual
  union all
  select '004_admin_villages_11.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '06081008' and '07060604') as actual
  union all
  select '004_admin_villages_12.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '07060605' and '08061501') as actual
  union all
  select '004_admin_villages_13.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '08061502' and '08110404') as actual
  union all
  select '004_admin_villages_14.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '08110405' and '10060310') as actual
  union all
  select '004_admin_villages_15.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '10060401' and '12040813') as actual
  union all
  select '004_admin_villages_16.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '12040814' and '12140103') as actual
  union all
  select '004_admin_villages_17.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '12140104' and '14020504') as actual
  union all
  select '004_admin_villages_18.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '14020505' and '14080109') as actual
  union all
  select '004_admin_villages_19.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '14080110' and '15010208') as actual
  union all
  select '004_admin_villages_20.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '15010209' and '15070207') as actual
  union all
  select '004_admin_villages_21.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '15070208' and '17040811') as actual
  union all
  select '004_admin_villages_22.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '17040812' and '17110601') as actual
  union all
  select '004_admin_villages_23.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '17110602' and '20021101') as actual
  union all
  select '004_admin_villages_24.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '20021102' and '20070201') as actual
  union all
  select '004_admin_villages_25.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '20070202' and '21050402') as actual
  union all
  select '004_admin_villages_26.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '21050403' and '21091113') as actual
  union all
  select '004_admin_villages_27.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '21091114' and '22050404') as actual
  union all
  select '004_admin_villages_28.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '22050405' and '25040121') as actual
  union all
  select '004_admin_villages_29.sql' as seed_file, 500 as expected, (select count(*) from admin_villages where code between '25040122' and '25071403') as actual
  union all
  select '004_admin_villages_30.sql' as seed_file, 12 as expected, (select count(*) from admin_villages where code between '25071404' and '25071415') as actual
)
select
  seed_file,
  expected,
  actual,
  case
    when actual = 0 then 'MISSING'
    when actual < expected then 'PARTIAL'
    when actual = expected then 'OK'
    else 'EXTRA'
  end as status
from checks
order by seed_file;

-- Overall counts:
-- select 'provinces' as tbl, count(*) from admin_provinces
-- union all select 'districts', count(*) from admin_districts
-- union all select 'communes', count(*) from admin_communes
-- union all select 'villages', count(*) from admin_villages;
