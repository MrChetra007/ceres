# Admin boundary seed files

These are split copies of the DataEF 2025 admin lists. The Supabase SQL
editor rejects the single 1.3 MB seeder as too large, so run these in numeric
order instead.

Run order:

```text
001_admin_provinces.sql
002_admin_districts.sql
003_admin_communes_01.sql ... _04.sql
004_admin_villages_01.sql ... _30.sql
```

Each file is idempotent (upsert by `code`), so it is safe to re-run a file
that failed partway through.

Expected totals:

```sql
select count(*) from admin_provinces;  -- 25
select count(*) from admin_districts;  -- 210
select count(*) from admin_communes;   -- 1661
select count(*) from admin_villages;   -- 14512
```

DataEF data-quality note: the source has 14,576 village rows, but it contains
54 duplicate village codes, one malformed code (`0506140-`), and 9 villages
whose commune code (`120913`) is missing from the commune list. The seed keeps
the first valid occurrence per code and skips malformed/orphan rows, leaving
14,512 usable villages.

Verify which files are present:

\`\`\`text
Run verify_seed.sql in the SQL editor.
It returns OK / PARTIAL / MISSING / EXTRA per seed file.
\`\`\`

Source: https://data.mef.gov.kh/api/v1/public-datasets
