-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'fuel_tank';

-- AlterTable
ALTER TABLE "UserNotificationPreference" ADD COLUMN "fuelTank" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "FuelDelivery" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fuelDataId" TEXT NOT NULL,
    "volumeGallons" DECIMAL(12,3) NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "notes" TEXT,
    "loggedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelPriceHistory" (
    "id" TEXT NOT NULL,
    "fuelDataId" TEXT NOT NULL,
    "oldPricePerGallon" DECIMAL(12,3) NOT NULL,
    "newPricePerGallon" DECIMAL(12,3) NOT NULL,
    "changedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelDailyVolumeSnapshot" (
    "id" TEXT NOT NULL,
    "fuelDataId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "volumeGallons" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuelDailyVolumeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FuelDailyVolumeSnapshot_fuelDataId_snapshotDate_key" ON "FuelDailyVolumeSnapshot"("fuelDataId", "snapshotDate");

-- CreateIndex
CREATE INDEX "FuelDailyVolumeSnapshot_snapshotDate_idx" ON "FuelDailyVolumeSnapshot"("snapshotDate");

-- CreateIndex
CREATE INDEX "FuelDelivery_storeId_deliveryDate_idx" ON "FuelDelivery"("storeId", "deliveryDate" DESC);

-- CreateIndex
CREATE INDEX "FuelDelivery_fuelDataId_idx" ON "FuelDelivery"("fuelDataId");

-- CreateIndex
CREATE INDEX "FuelPriceHistory_fuelDataId_createdAt_idx" ON "FuelPriceHistory"("fuelDataId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "FuelDelivery" ADD CONSTRAINT "FuelDelivery_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelDelivery" ADD CONSTRAINT "FuelDelivery_fuelDataId_fkey" FOREIGN KEY ("fuelDataId") REFERENCES "FuelData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelDelivery" ADD CONSTRAINT "FuelDelivery_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelPriceHistory" ADD CONSTRAINT "FuelPriceHistory_fuelDataId_fkey" FOREIGN KEY ("fuelDataId") REFERENCES "FuelData"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelPriceHistory" ADD CONSTRAINT "FuelPriceHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelDailyVolumeSnapshot" ADD CONSTRAINT "FuelDailyVolumeSnapshot_fuelDataId_fkey" FOREIGN KEY ("fuelDataId") REFERENCES "FuelData"("id") ON DELETE CASCADE ON UPDATE CASCADE;
