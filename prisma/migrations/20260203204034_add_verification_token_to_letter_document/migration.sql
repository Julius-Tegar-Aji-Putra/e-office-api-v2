/*
  Warnings:

  - A unique constraint covering the columns `[verificationToken]` on the table `letter_document` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "letter_document" ADD COLUMN     "verificationToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "letter_document_verificationToken_key" ON "letter_document"("verificationToken");

-- CreateIndex
CREATE INDEX "letter_document_verificationToken_idx" ON "letter_document"("verificationToken");
