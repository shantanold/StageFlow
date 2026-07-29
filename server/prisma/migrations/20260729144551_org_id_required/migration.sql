-- Flips org_id from nullable to required now that every route goes through
-- the tenant-scoping Prisma extension (which always supplies it on create,
-- and every existing row was backfilled in 20260723150537_backfill_default_org).
-- Also flips organizations.invite_code required, and moves items.sku from a
-- global-unique constraint to a per-org compound unique constraint.

ALTER TABLE "users"      ALTER COLUMN "org_id" SET NOT NULL;
ALTER TABLE "sets"       ALTER COLUMN "org_id" SET NOT NULL;
ALTER TABLE "items"      ALTER COLUMN "org_id" SET NOT NULL;
ALTER TABLE "jobs"       ALTER COLUMN "org_id" SET NOT NULL;
ALTER TABLE "job_items"  ALTER COLUMN "org_id" SET NOT NULL;
ALTER TABLE "movements"  ALTER COLUMN "org_id" SET NOT NULL;

ALTER TABLE "organizations" ALTER COLUMN "invite_code" SET NOT NULL;

-- items.sku: global unique -> per-org unique
DROP INDEX "items_sku_key";
CREATE UNIQUE INDEX "items_org_id_sku_key" ON "items"("org_id", "sku");
