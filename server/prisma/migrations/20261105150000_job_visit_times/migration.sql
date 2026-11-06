-- Optional time of day ("HH:MM", org time zone) for a job's staging and
-- destage visits. Null start time means the visit is all day.

-- AlterTable
ALTER TABLE "jobs" ADD COLUMN "stage_start_time" TEXT,
ADD COLUMN "stage_end_time" TEXT,
ADD COLUMN "destage_start_time" TEXT,
ADD COLUMN "destage_end_time" TEXT;
