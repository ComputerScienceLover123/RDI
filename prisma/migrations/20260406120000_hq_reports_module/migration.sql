-- CreateEnum
CREATE TYPE "HqReportType" AS ENUM (
  'sales_summary',
  'inventory_valuation',
  'purchase_order_summary',
  'labor_summary',
  'fuel_performance',
  'foodservice',
  'lottery',
  'scan_data',
  'shrinkage'
);

-- CreateEnum
CREATE TYPE "HqReportStoreScope" AS ENUM ('all', 'subset', 'single');

-- CreateEnum
CREATE TYPE "HqReportDatePreset" AS ENUM (
  'last_7_days',
  'last_30_days',
  'last_month',
  'last_quarter',
  'custom_range'
);

-- CreateEnum
CREATE TYPE "HqReportScheduleFrequency" AS ENUM ('daily', 'weekly_monday', 'monthly_first');

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'reporting';

-- AlterTable
ALTER TABLE "UserNotificationPreference" ADD COLUMN "reporting" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "HqReportTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportType" "HqReportType" NOT NULL,
    "storeScope" "HqReportStoreScope" NOT NULL,
    "storeIds" JSONB NOT NULL,
    "datePreset" "HqReportDatePreset" NOT NULL,
    "customDateFrom" DATE,
    "customDateTo" DATE,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqReportSchedule" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "frequency" "HqReportScheduleFrequency" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HqReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HqGeneratedReport" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "reportType" "HqReportType" NOT NULL,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "storeScopeJson" JSONB NOT NULL,
    "generatedById" TEXT NOT NULL,
    "csvRelPath" TEXT NOT NULL,
    "pdfRelPath" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HqGeneratedReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HqReportTemplate_createdById_idx" ON "HqReportTemplate"("createdById");

-- CreateIndex
CREATE INDEX "HqReportSchedule_templateId_idx" ON "HqReportSchedule"("templateId");

-- CreateIndex
CREATE INDEX "HqReportSchedule_enabled_idx" ON "HqReportSchedule"("enabled");

-- CreateIndex
CREATE INDEX "HqGeneratedReport_generatedById_idx" ON "HqGeneratedReport"("generatedById");

-- CreateIndex
CREATE INDEX "HqGeneratedReport_expiresAt_idx" ON "HqGeneratedReport"("expiresAt");

-- CreateIndex
CREATE INDEX "HqGeneratedReport_createdAt_idx" ON "HqGeneratedReport"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "HqReportTemplate" ADD CONSTRAINT "HqReportTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqReportSchedule" ADD CONSTRAINT "HqReportSchedule_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "HqReportTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HqGeneratedReport" ADD CONSTRAINT "HqGeneratedReport_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
