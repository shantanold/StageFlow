-- Google Calendar read-only sync: connected Google accounts, and calendar
-- sources that point at one of their calendars instead of an ICS URL.

-- AlterEnum
ALTER TYPE "EventSource" ADD VALUE 'google';

-- CreateTable
CREATE TABLE "google_connections" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "google_email" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "connected_by" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_connections_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "calendar_sources" ALTER COLUMN "url" DROP NOT NULL,
ADD COLUMN "google_connection_id" TEXT,
ADD COLUMN "google_calendar_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "google_connections_org_id_google_email_key" ON "google_connections"("org_id", "google_email");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_sources_google_connection_id_google_calendar_id_key" ON "calendar_sources"("google_connection_id", "google_calendar_id");

-- AddForeignKey
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_connected_by_fkey" FOREIGN KEY ("connected_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_sources" ADD CONSTRAINT "calendar_sources_google_connection_id_fkey" FOREIGN KEY ("google_connection_id") REFERENCES "google_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same as the other tenant tables: RLS on (deny-all for anon/authenticated
-- PostgREST roles); the API connects as the table owner, so it isn't forced.
ALTER TABLE "google_connections" ENABLE ROW LEVEL SECURITY;
