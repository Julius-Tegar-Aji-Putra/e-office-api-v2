/*
  Warnings:

  - Added the required column `storageName` to the `letter_attachment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storagePath` to the `letter_attachment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "letter_attachment" ADD COLUMN     "storageName" TEXT NOT NULL,
ADD COLUMN     "storagePath" TEXT NOT NULL,
ALTER COLUMN "fileUrl" DROP NOT NULL;
