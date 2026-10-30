-- Backfill Staging Projects spreadsheet fields onto existing production jobs.
-- Matched 20 of 22 live jobs by street address against Staging_Projects.xlsx.
-- Unmatched (not in spreadsheet): 14159 Clover Point Dr; 10038 Westview Dr.
-- Updates target production job UUIDs; no-ops harmlessly elsewhere.

-- 1946 Pech Rd ← 2026 Stagings / Mazz constructions/Suzanne Massiatte
UPDATE "jobs" SET
  "amount" = 3600,
  "monthly_rate" = 1200,
  "duration" = '3 Months',
  "market_value" = 1149000,
  "extension_amount" = NULL,
  "total_paid" = 3600,
  "destaged_at" = NULL
WHERE "id" = 'bb0dc528-e775-4474-a4f3-9c59f51b6c6e';

-- 10315 Fountain Shore Dr ← 2026 Stagings / Yasir Shafiq/Sethia
UPDATE "jobs" SET
  "amount" = 3200,
  "monthly_rate" = 1066.67,
  "duration" = '3 Months',
  "market_value" = 1295000,
  "extension_amount" = NULL,
  "total_paid" = 3200,
  "destaged_at" = NULL
WHERE "id" = '5a373e2f-20a6-42dd-98a4-15f27de62d40';

-- 1110 Ancrum Hill Ln ← 2026 Stagings / Leela Nimmagadda/Sapana Patel
UPDATE "jobs" SET
  "amount" = 3400,
  "monthly_rate" = 1133.33,
  "duration" = '3 Months',
  "market_value" = 729900,
  "extension_amount" = NULL,
  "total_paid" = 3400,
  "destaged_at" = NULL
WHERE "id" = '886ce100-4da9-4739-a1c4-c1d909a5b689';

-- 9592 Doliver Dr. ← 2026 Stagings / Weiwei Wan
UPDATE "jobs" SET
  "amount" = 3000,
  "monthly_rate" = 1000,
  "duration" = '3 Months',
  "market_value" = 469000,
  "extension_amount" = NULL,
  "total_paid" = 3000,
  "destaged_at" = NULL
WHERE "id" = '95fa523e-8c6e-4b89-a22f-7060a50bc918';

-- 3923 Pebble Heights Lane ← 2026 Stagings / Seth Real Estate/Kunal Seth
UPDATE "jobs" SET
  "amount" = 3500,
  "monthly_rate" = 1166.67,
  "duration" = '3 Months',
  "market_value" = 699000,
  "extension_amount" = NULL,
  "total_paid" = 3500,
  "destaged_at" = NULL
WHERE "id" = '111eb552-5a10-4851-b5c7-c25a617a3e7e';

-- 2710 Golden Larch Dr ← 2026 Stagings / Justin Elliot/Sherry
UPDATE "jobs" SET
  "amount" = 3200,
  "monthly_rate" = 1066.67,
  "duration" = '3 Months',
  "market_value" = 625000,
  "extension_amount" = NULL,
  "total_paid" = 3200,
  "destaged_at" = NULL
WHERE "id" = 'bb2ac2a0-b61a-4d20-9962-ad13ea6a37d0';

-- 38 Penny Green St. ← 2026 Stagings / Lina Chou/Maggie Guan
UPDATE "jobs" SET
  "amount" = 3600,
  "monthly_rate" = 1200,
  "duration" = '3 Months',
  "market_value" = 923000,
  "extension_amount" = NULL,
  "total_paid" = 3600,
  "destaged_at" = NULL
WHERE "id" = '948c7ed3-1e65-43c5-a065-606521d36cd8';

-- 707 Cranfield Ct. ← 2026 Stagings / Weiwei Wan
UPDATE "jobs" SET
  "amount" = 3500,
  "monthly_rate" = 1166.67,
  "duration" = '3 Months',
  "market_value" = 549900,
  "extension_amount" = NULL,
  "total_paid" = 3500,
  "destaged_at" = NULL
WHERE "id" = '1e7818a7-8ed5-4ea7-9c8a-88d894d0cd69';

-- 2131 Creekshire Dr. ← 2026 Stagings / IUI Properties Investments,LLC/Uzair
UPDATE "jobs" SET
  "amount" = 2900,
  "monthly_rate" = 966.67,
  "duration" = '3 Months',
  "market_value" = 339000,
  "extension_amount" = NULL,
  "total_paid" = 2900,
  "destaged_at" = NULL
WHERE "id" = '1c63872d-ecd4-4257-8755-70f47c2aab4d';

-- 3402 Shadowwalk Dr ← 2026 Stagings / 2911 RE Investments LLC
UPDATE "jobs" SET
  "amount" = 3500,
  "monthly_rate" = 1166.67,
  "duration" = '3 Months',
  "market_value" = 399000,
  "extension_amount" = NULL,
  "total_paid" = 3500,
  "destaged_at" = NULL
WHERE "id" = '13ea7eb0-2d54-42d5-9d15-5c6fc0525544';

-- 13802 Arroyo Grande Dr ← 2026 Stagings / Jorge Galeano
UPDATE "jobs" SET
  "amount" = 3500,
  "monthly_rate" = 1166.67,
  "duration" = '3 Months',
  "market_value" = 749000,
  "extension_amount" = NULL,
  "total_paid" = 3500,
  "destaged_at" = NULL
WHERE "id" = '0745e706-8300-4980-9ea3-364dd485c15c';

-- 4911 Big Elm Cir ← 2026 Stagings / Chang Yi Wang/Shannon Gao
UPDATE "jobs" SET
  "amount" = 2800,
  "monthly_rate" = 933.33,
  "duration" = '3 Months',
  "market_value" = 358000,
  "extension_amount" = NULL,
  "total_paid" = 2800,
  "destaged_at" = NULL
WHERE "id" = '36daa575-238b-441f-bac0-7f0c8dd2d304';

-- 7507 Baldwin Crossing ← 2026 Stagings / Abhiram Sundaram/Sapana Patel
UPDATE "jobs" SET
  "amount" = 3700,
  "monthly_rate" = 1233.33,
  "duration" = '3 Months',
  "market_value" = NULL,
  "extension_amount" = NULL,
  "total_paid" = 3700,
  "destaged_at" = NULL
WHERE "id" = '1496000a-a524-4594-ba51-6ce6bbfbee60';

-- 7610 Northwoods Dr ← 2026 Stagings / Seth Real estate/Kunal Seth
UPDATE "jobs" SET
  "amount" = 4100,
  "monthly_rate" = 1366.67,
  "duration" = '4 months',
  "market_value" = 1395000,
  "extension_amount" = NULL,
  "total_paid" = 4100,
  "destaged_at" = NULL
WHERE "id" = '2cdb17c9-f768-4c59-9da3-09d3e42c33df';

-- 19 N Creekside Ln ← 2026 Stagings / Bruce Yanta
UPDATE "jobs" SET
  "amount" = 3500,
  "monthly_rate" = 1166.67,
  "duration" = '3 Months',
  "market_value" = 1078000,
  "extension_amount" = NULL,
  "total_paid" = 3500,
  "destaged_at" = '2026-10-23'::date
WHERE "id" = '053a83c7-ce77-4c43-b57e-c743600e9f3a';

-- 80 Cokeberry Ct ← 2026 Stagings / 2911 RE Investments LLC
UPDATE "jobs" SET
  "amount" = 3000,
  "monthly_rate" = 1000,
  "duration" = '3 Months',
  "market_value" = 285000,
  "extension_amount" = NULL,
  "total_paid" = 3000,
  "destaged_at" = '2026-09-19'::date
WHERE "id" = '8489bd88-a160-432a-a968-efb1fd9546aa';

-- 6715 Lathrop ct ← 2026 Stagings / Diana Barnett
UPDATE "jobs" SET
  "amount" = 3800,
  "monthly_rate" = 1266.67,
  "duration" = '3 Months',
  "market_value" = 626000,
  "extension_amount" = NULL,
  "total_paid" = 3800,
  "destaged_at" = '2026-09-21'::date
WHERE "id" = '774b5b7c-cfca-4b0a-99bd-d96874d22eac';

-- 3319 Almond Creek Dr. ← 2026 Stagings / IUI Properties Investments,LLC/Uzair
UPDATE "jobs" SET
  "amount" = 3300,
  "monthly_rate" = 1100,
  "duration" = '3 Months',
  "market_value" = 449000,
  "extension_amount" = NULL,
  "total_paid" = 3300,
  "destaged_at" = '2026-09-21'::date
WHERE "id" = 'f372956d-8726-4a1d-a1f3-320bd4fc407e';

-- 17218 Milrig Ct. ← 2026 Stagings / Serena Chiu/Jennifer Werner
UPDATE "jobs" SET
  "amount" = 3500,
  "monthly_rate" = 1166.67,
  "duration" = '3 Months',
  "market_value" = 620000,
  "extension_amount" = NULL,
  "total_paid" = 3500,
  "destaged_at" = '2026-10-28'::date
WHERE "id" = '0f58b8c5-3c7c-4e5b-b194-63dcdf1d8ba3';

-- 12403 De Forrest St ← 2026 Stagings / IUI Properties Investments,LLC/Uzair
UPDATE "jobs" SET
  "amount" = 3100,
  "monthly_rate" = 1033.33,
  "duration" = '3 Months',
  "market_value" = 289000,
  "extension_amount" = NULL,
  "total_paid" = 3100,
  "destaged_at" = '2026-10-27'::date
WHERE "id" = 'bfdd35c4-548c-4b1d-a55b-c8f2cac61832';

