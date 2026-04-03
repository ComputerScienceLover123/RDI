-- CreateEnum
CREATE TYPE "ScanDataPaymentFrequency" AS ENUM ('weekly', 'monthly', 'quarterly');

-- CreateEnum
CREATE TYPE "ScanDataProgramStatus" AS ENUM ('active', 'paused', 'expired');

-- CreateEnum
CREATE TYPE "ScanDataRebateType" AS ENUM ('per_unit', 'percentage');

-- CreateEnum
CREATE TYPE "ScanDataSubmissionStatus" AS ENUM ('pending', 'submitted', 'confirmed', 'paid');

-- CreateEnum
CREATE TYPE "ScanDataFileFormat" AS ENUM ('csv', 'xml', 'api');

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'scan_data';

-- AlterTable
ALTER TABLE "UserNotificationPreference" ADD COLUMN "scanData" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ScanDataProgram" (
    "id" TEXT NOT NULL,
    "programName" TEXT NOT NULL,
    "manufacturerName" TEXT NOT NULL,
    "rebateType" "ScanDataRebateType" NOT NULL,
    "rebateValue" DECIMAL(12,4) NOT NULL,
    "paymentFrequency" "ScanDataPaymentFrequency" NOT NULL,
    "status" "ScanDataProgramStatus" NOT NULL DEFAULT 'active',
    "contactEmail" TEXT NOT NULL,
    "enrollmentDate" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScanDataProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanDataProgramProduct" (
    "programId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "ScanDataProgramProduct_pkey" PRIMARY KEY ("programId","productId")
);

-- CreateTable
CREATE TABLE "ScanDataSubmission" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "reportingPeriodStart" DATE NOT NULL,
    "reportingPeriodEnd" DATE NOT NULL,
    "totalQualifyingUnitsSold" INTEGER NOT NULL,
    "totalRebateValueCalculated" DECIMAL(14,2) NOT NULL,
    "status" "ScanDataSubmissionStatus" NOT NULL DEFAULT 'pending',
    "submittedAt" TIMESTAMP(3),
    "paymentReceivedAt" DATE,
    "paymentAmountReceived" DECIMAL(14,2),
    "submittedById" TEXT,
    "fileFormat" "ScanDataFileFormat" NOT NULL DEFAULT 'csv',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScanDataSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanDataProgram_status_idx" ON "ScanDataProgram"("status");

-- CreateIndex
CREATE INDEX "ScanDataProgram_manufacturerName_idx" ON "ScanDataProgram"("manufacturerName");

-- CreateIndex
CREATE INDEX "ScanDataProgramProduct_productId_idx" ON "ScanDataProgramProduct"("productId");

-- CreateIndex
CREATE INDEX "ScanDataSubmission_programId_idx" ON "ScanDataSubmission"("programId");

-- CreateIndex
CREATE INDEX "ScanDataSubmission_storeId_idx" ON "ScanDataSubmission"("storeId");

-- CreateIndex
CREATE INDEX "ScanDataSubmission_status_idx" ON "ScanDataSubmission"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ScanDataSubmission_storeId_programId_reportingPeriodStart_repo_key" ON "ScanDataSubmission"("storeId", "programId", "reportingPeriodStart", "reportingPeriodEnd");

-- AddForeignKey
ALTER TABLE "ScanDataProgramProduct" ADD CONSTRAINT "ScanDataProgramProduct_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ScanDataProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanDataProgramProduct" ADD CONSTRAINT "ScanDataProgramProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanDataSubmission" ADD CONSTRAINT "ScanDataSubmission_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanDataSubmission" ADD CONSTRAINT "ScanDataSubmission_programId_fkey" FOREIGN KEY ("programId") REFERENCES "ScanDataProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanDataSubmission" ADD CONSTRAINT "ScanDataSubmission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
