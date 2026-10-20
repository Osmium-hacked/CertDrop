-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('PENDING', 'READY');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('QUEUED', 'GENERATED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "FailedStage" AS ENUM ('GENERATE', 'SEND');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('DELIVERED', 'BOUNCED', 'COMPLAINED');

-- CreateTable
CREATE TABLE "Organizer" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organizer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "widthPt" DOUBLE PRECISION,
    "heightPt" DOUBLE PRECISION,
    "status" "TemplateStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "emailSubject" TEXT NOT NULL,
    "emailMessage" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filesDeletedAt" TIMESTAMP(3),

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "pdfKey" TEXT,
    "status" "CertificateStatus" NOT NULL DEFAULT 'QUEUED',
    "failedStage" "FailedStage",
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "emailMessageId" TEXT,
    "deliveryStatus" "DeliveryStatus",
    "sentAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organizer_email_key" ON "Organizer"("email");

-- CreateIndex
CREATE INDEX "OtpCode_email_createdAt_idx" ON "OtpCode"("email", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Template_storageKey_key" ON "Template"("storageKey");

-- CreateIndex
CREATE INDEX "Template_organizerId_createdAt_idx" ON "Template"("organizerId", "createdAt");

-- CreateIndex
CREATE INDEX "Batch_organizerId_createdAt_idx" ON "Batch"("organizerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_emailMessageId_key" ON "Certificate"("emailMessageId");

-- CreateIndex
CREATE INDEX "Certificate_batchId_status_idx" ON "Certificate"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_batchId_rowIndex_key" ON "Certificate"("batchId", "rowIndex");

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "Organizer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
