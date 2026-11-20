-- Seeder: villages - part 30 of 30
-- Generated from DataEF 2025 lists. Codes stay TEXT (leading zeros preserved).
-- Safe to re-run: upsert by code. Run files in numeric order.
--
-- Source: https://data.mef.gov.kh/api/v1/public-datasets

begin;

insert into public.admin_villages (code, commune_code, district_code, province_code, name_kh, name_en) values
  ('25071404', '250714', '2507', '25', 'អំពិលជ្រុំ', 'Ampil Chrum'),
  ('25071405', '250714', '2507', '25', 'ទួលគរ', 'Tuol Kor'),
  ('25071406', '250714', '2507', '25', 'ព្រែកតូច', 'Preaek Touch'),
  ('25071407', '250714', '2507', '25', 'ព្រែកជីក', 'Preaek Chik'),
  ('25071408', '250714', '2507', '25', 'ទួលខ្សាច់', 'Tuol Khsach'),
  ('25071409', '250714', '2507', '25', 'ដូនម៉ៅក្រោម', 'Doun Mau Kraom'),
  ('25071410', '250714', '2507', '25', 'ដូនម៉ៅលើ', 'Doun Mau Leu'),
  ('25071411', '250714', '2507', '25', 'ទន្លេបិទក្រោម', 'Tonle Bet Kraom'),
  ('25071412', '250714', '2507', '25', 'ទន្លេបិទលើ', 'Tonle Bet Leu'),
  ('25071413', '250714', '2507', '25', 'យាយស', 'Yeay Sa'),
  ('25071414', '250714', '2507', '25', 'ទន្លេបិទ', 'Tonle Bet'),
  ('25071415', '250714', '2507', '25', 'តាអ៊ុយ', 'Ta Uy')
on conflict (code) do update set commune_code = excluded.commune_code, district_code = excluded.district_code, province_code = excluded.province_code, name_kh = excluded.name_kh, name_en = excluded.name_en;

commit;
