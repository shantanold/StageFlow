-- AlterTable
ALTER TABLE "items" ADD COLUMN     "org_id" TEXT;

-- AlterTable
ALTER TABLE "job_items" ADD COLUMN     "org_id" TEXT;

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "org_id" TEXT;

-- AlterTable
ALTER TABLE "movements" ADD COLUMN     "org_id" TEXT;

-- AlterTable
ALTER TABLE "sets" ADD COLUMN     "org_id" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "org_id" TEXT;

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "items_org_id_status_idx" ON "items"("org_id", "status");

-- CreateIndex
CREATE INDEX "job_items_org_id_idx" ON "job_items"("org_id");

-- CreateIndex
CREATE INDEX "jobs_org_id_status_idx" ON "jobs"("org_id", "status");

-- CreateIndex
CREATE INDEX "movements_org_id_idx" ON "movements"("org_id");

-- CreateIndex
CREATE INDEX "sets_org_id_idx" ON "sets"("org_id");

-- CreateIndex
CREATE INDEX "users_org_id_idx" ON "users"("org_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sets" ADD CONSTRAINT "sets_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_items" ADD CONSTRAINT "job_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
