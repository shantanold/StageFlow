-- CreateTable
CREATE TABLE "quantity_items" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quantity_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quantity_items_org_id_idx" ON "quantity_items"("org_id");

-- CreateIndex
CREATE INDEX "quantity_items_org_id_category_idx" ON "quantity_items"("org_id", "category");

-- AddForeignKey
ALTER TABLE "quantity_items" ADD CONSTRAINT "quantity_items_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
