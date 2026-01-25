/*
  Warnings:

  - A unique constraint covering the columns `[nomorSurat]` on the table `letter_document` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "legalisasi_status" AS ENUM ('PENDING', 'NOMOR_DIBERIKAN', 'STEMPEL_DIBERIKAN', 'QR_GENERATED', 'COMPLETED');

-- AlterTable
ALTER TABLE "letter_document" ADD COLUMN     "barcodeData" TEXT,
ADD COLUMN     "legalisasiStatus" "legalisasi_status" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "readyToDistribute" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sealImageUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "letter_document_nomorSurat_key" ON "letter_document"("nomorSurat");

-- CreateIndex
CREATE INDEX "letter_document_nomorSurat_idx" ON "letter_document"("nomorSurat");
