-- Creates the first organization and backfills every existing row onto it.
-- Existing single-tenant data becomes "Org #1" ahead of org_id becoming
-- required. Idempotent: safe to re-run (ON CONFLICT DO NOTHING on the org row).

INSERT INTO "organizations" ("id", "name", "slug", "is_active", "created_at")
VALUES ('00000000-0000-0000-0000-000000000001', 'StageFlow', 'stageflow', true, now())
ON CONFLICT ("id") DO NOTHING;

UPDATE "users"      SET "org_id" = '00000000-0000-0000-0000-000000000001' WHERE "org_id" IS NULL;
UPDATE "sets"       SET "org_id" = '00000000-0000-0000-0000-000000000001' WHERE "org_id" IS NULL;
UPDATE "items"      SET "org_id" = '00000000-0000-0000-0000-000000000001' WHERE "org_id" IS NULL;
UPDATE "jobs"       SET "org_id" = '00000000-0000-0000-0000-000000000001' WHERE "org_id" IS NULL;
UPDATE "job_items"  SET "org_id" = '00000000-0000-0000-0000-000000000001' WHERE "org_id" IS NULL;
UPDATE "movements"  SET "org_id" = '00000000-0000-0000-0000-000000000001' WHERE "org_id" IS NULL;
