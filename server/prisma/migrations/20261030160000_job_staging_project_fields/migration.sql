-- AlterTable
ALTER TABLE "jobs" ADD COLUMN     "amount" DECIMAL(10,2),
ADD COLUMN     "monthly_rate" DECIMAL(10,2),
ADD COLUMN     "duration" TEXT,
ADD COLUMN     "market_value" DECIMAL(14,2),
ADD COLUMN     "extension_amount" DECIMAL(10,2),
ADD COLUMN     "total_paid" DECIMAL(10,2),
ADD COLUMN     "destaged_at" DATE;
