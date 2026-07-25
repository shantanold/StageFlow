-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "invite_code" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_invite_code_key" ON "organizations"("invite_code");
