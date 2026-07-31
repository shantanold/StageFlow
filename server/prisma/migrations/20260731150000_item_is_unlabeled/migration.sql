-- AlterTable
ALTER TABLE "items" ADD COLUMN "is_unlabeled" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "items_org_id_is_unlabeled_idx" ON "items"("org_id", "is_unlabeled");

-- Backfill existing blank placeholders (bulk-unlabeled + historical "Red Dot" names)
UPDATE "items"
SET "is_unlabeled" = true
WHERE
  "name" ILIKE 'Unlabeled %'
  OR LOWER(TRIM("name")) = 'red dot home services'
  OR "notes" ILIKE 'Placeholder — fill in%';
