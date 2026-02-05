-- AlterEnum
ALTER TYPE "Jenjang" ADD VALUE 'PROFESI';

-- AlterTable
ALTER TABLE "program_studi" ADD COLUMN     "hasKaprodi" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "managedByRole" TEXT DEFAULT 'KADEP';
