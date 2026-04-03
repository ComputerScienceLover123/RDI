-- CreateEnum
CREATE TYPE "FoodserviceCategory" AS ENUM ('roller_grill', 'pizza', 'chicken', 'sides', 'taquitos', 'tacos', 'beverages', 'other');

-- CreateEnum
CREATE TYPE "FoodserviceBrand" AS ENUM ('store_brand', 'hatch');

-- CreateEnum
CREATE TYPE "FoodserviceWasteReason" AS ENUM ('expired_hold', 'dropped', 'overproduction', 'quality_issue', 'other');

-- CreateEnum
CREATE TYPE "FoodserviceHotCaseStatus" AS ENUM ('active', 'sold', 'wasted');

-- CreateEnum
CREATE TYPE "ProductionPlanStatus" AS ENUM ('draft', 'confirmed');

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'foodservice';

-- AlterTable
ALTER TABLE "Store" ADD COLUMN "hatchEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserNotificationPreference" ADD COLUMN "foodservice" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" "FoodserviceBrand" NOT NULL,
    "category" "FoodserviceCategory" NOT NULL,
    "instructions" TEXT NOT NULL,
    "prepTimeMinutes" INTEGER NOT NULL,
    "cookTimeMinutes" INTEGER NOT NULL,
    "cookTemperature" TEXT,
    "yieldQuantity" DECIMAL(12,3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantityPerBatch" DECIMAL(14,4) NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodserviceMenuItem" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "category" "FoodserviceCategory" NOT NULL,
    "brand" "FoodserviceBrand" NOT NULL,
    "recipeId" TEXT,
    "retailPrice" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "holdTimeMinutes" INTEGER NOT NULL,
    "prepTimeMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodserviceMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodserviceHotCaseEntry" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantityPlaced" INTEGER NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "FoodserviceHotCaseStatus" NOT NULL DEFAULT 'active',
    "placedById" TEXT NOT NULL,
    "disposedAt" TIMESTAMP(3),
    "disposedById" TEXT,

    CONSTRAINT "FoodserviceHotCaseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodserviceWasteLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" "FoodserviceWasteReason" NOT NULL,
    "loggedById" TEXT NOT NULL,
    "hotCaseEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodserviceWasteLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionPlan" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "planDate" DATE NOT NULL,
    "status" "ProductionPlanStatus" NOT NULL DEFAULT 'draft',
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionPlanLine" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantitySuggested" INTEGER NOT NULL,
    "quantityFinal" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionPlanLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_idx" ON "RecipeIngredient"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeIngredient_productId_idx" ON "RecipeIngredient"("productId");

-- CreateIndex
CREATE INDEX "FoodserviceMenuItem_storeId_active_idx" ON "FoodserviceMenuItem"("storeId", "active");

-- CreateIndex
CREATE INDEX "FoodserviceHotCaseEntry_storeId_status_expiresAt_idx" ON "FoodserviceHotCaseEntry"("storeId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "FoodserviceHotCaseEntry_menuItemId_idx" ON "FoodserviceHotCaseEntry"("menuItemId");

-- CreateIndex
CREATE INDEX "FoodserviceWasteLog_storeId_createdAt_idx" ON "FoodserviceWasteLog"("storeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "FoodserviceWasteLog_menuItemId_idx" ON "FoodserviceWasteLog"("menuItemId");

-- CreateIndex
CREATE INDEX "ProductionPlanLine_planId_idx" ON "ProductionPlanLine"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionPlan_storeId_planDate_key" ON "ProductionPlan"("storeId", "planDate");

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodserviceMenuItem" ADD CONSTRAINT "FoodserviceMenuItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodserviceMenuItem" ADD CONSTRAINT "FoodserviceMenuItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodserviceHotCaseEntry" ADD CONSTRAINT "FoodserviceHotCaseEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodserviceHotCaseEntry" ADD CONSTRAINT "FoodserviceHotCaseEntry_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "FoodserviceMenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodserviceHotCaseEntry" ADD CONSTRAINT "FoodserviceHotCaseEntry_placedById_fkey" FOREIGN KEY ("placedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodserviceHotCaseEntry" ADD CONSTRAINT "FoodserviceHotCaseEntry_disposedById_fkey" FOREIGN KEY ("disposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodserviceWasteLog" ADD CONSTRAINT "FoodserviceWasteLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodserviceWasteLog" ADD CONSTRAINT "FoodserviceWasteLog_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "FoodserviceMenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodserviceWasteLog" ADD CONSTRAINT "FoodserviceWasteLog_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodserviceWasteLog" ADD CONSTRAINT "FoodserviceWasteLog_hotCaseEntryId_fkey" FOREIGN KEY ("hotCaseEntryId") REFERENCES "FoodserviceHotCaseEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlan" ADD CONSTRAINT "ProductionPlan_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlan" ADD CONSTRAINT "ProductionPlan_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanLine" ADD CONSTRAINT "ProductionPlanLine_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ProductionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionPlanLine" ADD CONSTRAINT "ProductionPlanLine_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "FoodserviceMenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
