-- CreateEnum
CREATE TYPE "LotteryPackStatus" AS ENUM ('inventory', 'activated', 'settled', 'returned');

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'lottery';

-- AlterTable
ALTER TABLE "UserNotificationPreference" ADD COLUMN "lottery" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "LotteryPack" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "gameName" TEXT NOT NULL,
    "packNumber" TEXT NOT NULL,
    "ticketCountPerPack" INTEGER NOT NULL,
    "ticketPrice" DECIMAL(10,2) NOT NULL,
    "status" "LotteryPackStatus" NOT NULL DEFAULT 'inventory',
    "activatedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "activatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotteryPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotterySettlement" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "gameName" TEXT NOT NULL,
    "totalTicketsInPack" INTEGER NOT NULL,
    "ticketsSoldCount" INTEGER NOT NULL,
    "ticketsRemainingCount" INTEGER NOT NULL,
    "expectedRevenue" DECIMAL(12,2) NOT NULL,
    "actualCashCollected" DECIMAL(12,2) NOT NULL,
    "overShortAmount" DECIMAL(12,2) NOT NULL,
    "settledById" TEXT NOT NULL,
    "settlementDate" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotterySettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LotteryDailySummary" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "summaryDate" DATE NOT NULL,
    "totalPacksActivated" INTEGER NOT NULL DEFAULT 0,
    "totalPacksSettled" INTEGER NOT NULL DEFAULT 0,
    "totalExpectedRevenueSettled" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalActualCollected" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "totalOverShort" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "instantTicketSalesPos" DECIMAL(14,2),
    "onlineLotterySalesTotal" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LotteryDailySummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LotteryPack_storeId_packNumber_key" ON "LotteryPack"("storeId", "packNumber");

-- CreateIndex
CREATE INDEX "LotteryPack_storeId_status_idx" ON "LotteryPack"("storeId", "status");

-- CreateIndex
CREATE INDEX "LotterySettlement_storeId_settlementDate_idx" ON "LotterySettlement"("storeId", "settlementDate");

-- CreateIndex
CREATE UNIQUE INDEX "LotterySettlement_packId_key" ON "LotterySettlement"("packId");

-- CreateIndex
CREATE UNIQUE INDEX "LotteryDailySummary_storeId_summaryDate_key" ON "LotteryDailySummary"("storeId", "summaryDate");

-- CreateIndex
CREATE INDEX "LotteryDailySummary_storeId_idx" ON "LotteryDailySummary"("storeId");

-- AddForeignKey
ALTER TABLE "LotteryPack" ADD CONSTRAINT "LotteryPack_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryPack" ADD CONSTRAINT "LotteryPack_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotterySettlement" ADD CONSTRAINT "LotterySettlement_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotterySettlement" ADD CONSTRAINT "LotterySettlement_packId_fkey" FOREIGN KEY ("packId") REFERENCES "LotteryPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotterySettlement" ADD CONSTRAINT "LotterySettlement_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryDailySummary" ADD CONSTRAINT "LotteryDailySummary_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
