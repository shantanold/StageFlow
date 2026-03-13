-- CreateEnum
CREATE TYPE "Role" AS ENUM ('staff', 'manager');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('available', 'staged', 'disposed');

-- CreateEnum
CREATE TYPE "ItemCondition" AS ENUM ('good', 'fair', 'damaged');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('planning', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "JobItemStatus" AS ENUM ('assigned', 'loaded', 'delivered', 'picked_up', 'returned');

-- CreateEnum
CREATE TYPE "ReturnCondition" AS ENUM ('good', 'damaged', 'dispose');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'staff',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "set_id" TEXT,
    "status" "ItemStatus" NOT NULL DEFAULT 'available',
    "condition" "ItemCondition" NOT NULL DEFAULT 'good',
    "photo_url" TEXT,
    "purchase_cost" DECIMAL(10,2) NOT NULL,
    "purchase_date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "client_contact" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'planning',
    "start_date" DATE NOT NULL,
    "expected_end_date" DATE NOT NULL,
    "actual_end_date" DATE,
    "created_by" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_items" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "status" "JobItemStatus" NOT NULL DEFAULT 'assigned',
    "return_condition" "ReturnCondition",
    "return_notes" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returned_at" TIMESTAMP(3),

    CONSTRAINT "job_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movements" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "job_id" TEXT,
    "from_status" TEXT NOT NULL,
    "to_status" TEXT NOT NULL,
    "performed_by" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "items_sku_key" ON "items"("sku");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_items" ADD CONSTRAINT "job_items_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_items" ADD CONSTRAINT "job_items_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movements" ADD CONSTRAINT "movements_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
