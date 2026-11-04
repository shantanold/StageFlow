-- Calendar / scheduling: events (manual, imported from .ics files, or synced
-- from subscribed ICS/webcal URLs) and the subscriptions themselves.

-- CreateEnum
CREATE TYPE "EventSource" AS ENUM ('manual', 'ics_file', 'ics_url');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Chicago';

-- CreateTable
CREATE TABLE "calendar_sources" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "event_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "start_at" TIMESTAMPTZ(3) NOT NULL,
    "end_at" TIMESTAMPTZ(3) NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "is_busy" BOOLEAN NOT NULL DEFAULT true,
    "job_id" TEXT,
    "assignee_id" TEXT,
    "source" "EventSource" NOT NULL DEFAULT 'manual',
    "source_id" TEXT,
    "external_uid" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "calendar_sources_org_id_idx" ON "calendar_sources"("org_id");

-- CreateIndex
CREATE INDEX "events_org_id_start_at_idx" ON "events"("org_id", "start_at");

-- CreateIndex
CREATE INDEX "events_org_id_end_at_idx" ON "events"("org_id", "end_at");

-- CreateIndex
CREATE INDEX "events_source_id_idx" ON "events"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_org_id_external_uid_key" ON "events"("org_id", "external_uid");

-- AddForeignKey
ALTER TABLE "calendar_sources" ADD CONSTRAINT "calendar_sources_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "calendar_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Lock the new tables out of Supabase's Data API, like every other table
-- (see 20261021120000_enable_rls). No policies; the server's owner role bypasses RLS.
ALTER TABLE "calendar_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
