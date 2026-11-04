-- Google Calendar: optionally write each job's staging and destage days to
-- one calendar of a connected account (needs the calendar.events scope).

-- AlterTable
ALTER TABLE "google_connections" ADD COLUMN "can_write" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "job_calendar_id" TEXT,
ADD COLUMN "push_error" TEXT;
