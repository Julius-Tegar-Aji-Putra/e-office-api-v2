-- CreateEnum
CREATE TYPE "signature_status" AS ENUM ('PENDING', 'SIGNED', 'REJECTED');

-- AlterTable
ALTER TABLE "document_signature" ADD COLUMN     "status" "signature_status" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "signedAt" DROP NOT NULL,
ALTER COLUMN "signedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "letter_instance" ADD COLUMN     "contentHtml" TEXT;

-- AlterTable
ALTER TABLE "saved_signature" ADD COLUMN     "alias" TEXT;
