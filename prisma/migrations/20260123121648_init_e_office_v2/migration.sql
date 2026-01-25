-- CreateEnum
CREATE TYPE "Jenjang" AS ENUM ('D3', 'S1', 'S2', 'S3');

-- CreateEnum
CREATE TYPE "signature_type" AS ENUM ('UPLOAD', 'HANDWRITING');

-- CreateEnum
CREATE TYPE "signature_status" AS ENUM ('PENDING', 'SIGNED', 'REJECTED');

-- CreateEnum
CREATE TYPE "legalisasi_status" AS ENUM ('PENDING', 'NOMOR_DIBERIKAN', 'STEMPEL_DIBERIKAN', 'QR_GENERATED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "letter_category" AS ENUM ('AKADEMIK', 'SUMBER_DAYA', 'UMUM');

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('SURAT_PENGANTAR', 'SURAT_KEPUTUSAN', 'SURAT_TUGAS');

-- CreateEnum
CREATE TYPE "priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "log_action" AS ENUM ('SUBMIT', 'RESUBMIT', 'APPROVE', 'REJECT', 'RETURN', 'DISPOSITION', 'DRAFT_CREATE', 'DRAFT_UPDATE', 'VERIFY', 'REQUEST_REVISION', 'SIGN', 'ASSIGN_NUMBER', 'STAMP', 'GENERATE_QR', 'FINALIZE', 'STATUS_CHANGE', 'COMMENT');

-- CreateEnum
CREATE TYPE "letter_status" AS ENUM ('SUBMITTED', 'KAPRODI_REVIEW', 'SURAT_PENGANTAR_DRAFT', 'SURAT_PENGANTAR_REVIEW', 'SURAT_PENGANTAR_SIGNED', 'FAKULTAS_RECEIVED', 'FAKULTAS_DISPOSITION', 'FAKULTAS_DRAFTING', 'FAKULTAS_VERIFICATION', 'FAKULTAS_SIGNING', 'UPA_NUMBERING', 'UPA_STAMPING', 'UPA_FINALIZING', 'COMPLETED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "isAnonymous" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mahasiswa" (
    "id" TEXT NOT NULL,
    "nim" TEXT NOT NULL,
    "tahunMasuk" TEXT NOT NULL,
    "noHp" TEXT NOT NULL,
    "alamat" TEXT,
    "tempatLahir" TEXT,
    "tanggalLahir" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "departemenId" TEXT NOT NULL,
    "programStudiId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "mahasiswa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pegawai" (
    "id" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "jabatan" TEXT NOT NULL,
    "noHp" TEXT,
    "userId" TEXT NOT NULL,
    "departemenId" TEXT NOT NULL,
    "programStudiId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pegawai_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departemen" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "departemen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "program_studi" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "jenjang" "Jenjang" NOT NULL DEFAULT 'S1',
    "departemenId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "program_studi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_signature" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "signature_type" NOT NULL DEFAULT 'UPLOAD',
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "alias" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_type" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "category" "letter_category" NOT NULL DEFAULT 'UMUM',
    "requiresPengantar" BOOLEAN NOT NULL DEFAULT true,
    "requiresDekanSign" BOOLEAN NOT NULL DEFAULT true,
    "requiresWadekSign" BOOLEAN NOT NULL DEFAULT false,
    "defaultTargetSigner" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "letter_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_template" (
    "id" TEXT NOT NULL,
    "version_name" TEXT NOT NULL,
    "schema_definition" JSONB NOT NULL,
    "form_fields" JSONB NOT NULL,
    "content_template" JSONB,
    "letter_type_id" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "letter_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_instance" (
    "id" TEXT NOT NULL,
    "submissionValues" JSONB NOT NULL,
    "status" "letter_status" NOT NULL DEFAULT 'SUBMITTED',
    "currentActiveRole" TEXT,
    "priority" "priority" NOT NULL DEFAULT 'NORMAL',
    "signatureConfig" JSONB,
    "contentHtml" TEXT,
    "letterTypeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "letter_instance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_document" (
    "id" TEXT NOT NULL,
    "letterInstanceId" TEXT NOT NULL,
    "type" "document_type" NOT NULL,
    "content" JSONB,
    "tembusan" JSONB,
    "nomorSurat" TEXT,
    "tanggalSurat" TIMESTAMP(3),
    "perihal" TEXT,
    "isSigned" BOOLEAN NOT NULL DEFAULT false,
    "fileUrl" TEXT,
    "qrCodeUrl" TEXT,
    "legalisasiStatus" "legalisasi_status" NOT NULL DEFAULT 'PENDING',
    "sealImageUrl" TEXT,
    "barcodeData" TEXT,
    "readyToDistribute" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "letter_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_signature" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "signerId" TEXT NOT NULL,
    "signerRole" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerNip" TEXT,
    "signatureUrl" TEXT,
    "status" "signature_status" NOT NULL DEFAULT 'PENDING',
    "signedAt" TIMESTAMP(3),
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_log" (
    "id" TEXT NOT NULL,
    "letterInstanceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" "log_action" NOT NULL,
    "fromStatus" "letter_status",
    "toStatus" "letter_status",
    "targetRole" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "letter_attachment" (
    "id" TEXT NOT NULL,
    "letterInstanceId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "description" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "letter_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "role_name_key" ON "role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permission_resource_action_key" ON "permission"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_userId_roleId_key" ON "user_role"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permission_roleId_permissionId_key" ON "role_permission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "mahasiswa_nim_key" ON "mahasiswa"("nim");

-- CreateIndex
CREATE UNIQUE INDEX "mahasiswa_userId_key" ON "mahasiswa"("userId");

-- CreateIndex
CREATE INDEX "mahasiswa_departemenId_idx" ON "mahasiswa"("departemenId");

-- CreateIndex
CREATE INDEX "mahasiswa_programStudiId_idx" ON "mahasiswa"("programStudiId");

-- CreateIndex
CREATE UNIQUE INDEX "pegawai_nip_key" ON "pegawai"("nip");

-- CreateIndex
CREATE UNIQUE INDEX "pegawai_userId_key" ON "pegawai"("userId");

-- CreateIndex
CREATE INDEX "pegawai_departemenId_idx" ON "pegawai"("departemenId");

-- CreateIndex
CREATE INDEX "pegawai_programStudiId_idx" ON "pegawai"("programStudiId");

-- CreateIndex
CREATE UNIQUE INDEX "departemen_code_key" ON "departemen"("code");

-- CreateIndex
CREATE UNIQUE INDEX "program_studi_code_key" ON "program_studi"("code");

-- CreateIndex
CREATE INDEX "program_studi_departemenId_idx" ON "program_studi"("departemenId");

-- CreateIndex
CREATE INDEX "saved_signature_userId_idx" ON "saved_signature"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "letter_type_code_key" ON "letter_type"("code");

-- CreateIndex
CREATE INDEX "letter_template_letter_type_id_idx" ON "letter_template"("letter_type_id");

-- CreateIndex
CREATE INDEX "letter_instance_status_idx" ON "letter_instance"("status");

-- CreateIndex
CREATE INDEX "letter_instance_letterTypeId_idx" ON "letter_instance"("letterTypeId");

-- CreateIndex
CREATE INDEX "letter_instance_createdById_idx" ON "letter_instance"("createdById");

-- CreateIndex
CREATE INDEX "letter_instance_currentActiveRole_idx" ON "letter_instance"("currentActiveRole");

-- CreateIndex
CREATE INDEX "letter_document_letterInstanceId_idx" ON "letter_document"("letterInstanceId");

-- CreateIndex
CREATE INDEX "letter_document_nomorSurat_idx" ON "letter_document"("nomorSurat");

-- CreateIndex
CREATE UNIQUE INDEX "letter_document_nomorSurat_key" ON "letter_document"("nomorSurat");

-- CreateIndex
CREATE UNIQUE INDEX "letter_document_letterInstanceId_type_key" ON "letter_document"("letterInstanceId", "type");

-- CreateIndex
CREATE INDEX "document_signature_documentId_idx" ON "document_signature"("documentId");

-- CreateIndex
CREATE INDEX "document_signature_signerId_idx" ON "document_signature"("signerId");

-- CreateIndex
CREATE UNIQUE INDEX "document_signature_documentId_signerRole_key" ON "document_signature"("documentId", "signerRole");

-- CreateIndex
CREATE INDEX "letter_log_letterInstanceId_idx" ON "letter_log"("letterInstanceId");

-- CreateIndex
CREATE INDEX "letter_log_actorId_idx" ON "letter_log"("actorId");

-- CreateIndex
CREATE INDEX "letter_log_action_idx" ON "letter_log"("action");

-- CreateIndex
CREATE INDEX "letter_attachment_letterInstanceId_idx" ON "letter_attachment"("letterInstanceId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mahasiswa" ADD CONSTRAINT "mahasiswa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mahasiswa" ADD CONSTRAINT "mahasiswa_departemenId_fkey" FOREIGN KEY ("departemenId") REFERENCES "departemen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mahasiswa" ADD CONSTRAINT "mahasiswa_programStudiId_fkey" FOREIGN KEY ("programStudiId") REFERENCES "program_studi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pegawai" ADD CONSTRAINT "pegawai_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pegawai" ADD CONSTRAINT "pegawai_departemenId_fkey" FOREIGN KEY ("departemenId") REFERENCES "departemen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pegawai" ADD CONSTRAINT "pegawai_programStudiId_fkey" FOREIGN KEY ("programStudiId") REFERENCES "program_studi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_studi" ADD CONSTRAINT "program_studi_departemenId_fkey" FOREIGN KEY ("departemenId") REFERENCES "departemen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_signature" ADD CONSTRAINT "saved_signature_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_template" ADD CONSTRAINT "letter_template_letter_type_id_fkey" FOREIGN KEY ("letter_type_id") REFERENCES "letter_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_instance" ADD CONSTRAINT "letter_instance_letterTypeId_fkey" FOREIGN KEY ("letterTypeId") REFERENCES "letter_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_instance" ADD CONSTRAINT "letter_instance_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_document" ADD CONSTRAINT "letter_document_letterInstanceId_fkey" FOREIGN KEY ("letterInstanceId") REFERENCES "letter_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signature" ADD CONSTRAINT "document_signature_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "letter_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_signature" ADD CONSTRAINT "document_signature_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_log" ADD CONSTRAINT "letter_log_letterInstanceId_fkey" FOREIGN KEY ("letterInstanceId") REFERENCES "letter_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_log" ADD CONSTRAINT "letter_log_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "letter_attachment" ADD CONSTRAINT "letter_attachment_letterInstanceId_fkey" FOREIGN KEY ("letterInstanceId") REFERENCES "letter_instance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
