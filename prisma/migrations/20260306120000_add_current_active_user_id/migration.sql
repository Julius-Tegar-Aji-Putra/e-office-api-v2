-- AlterTable
ALTER TABLE "letter_instance" ADD COLUMN "currentActiveUserId" TEXT;

-- CreateIndex
CREATE INDEX "letter_instance_currentActiveUserId_idx" ON "letter_instance"("currentActiveUserId");
