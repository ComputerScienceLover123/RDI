-- CreateTable
CREATE TABLE "StoreProductPriceOverride" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "retailPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreProductPriceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductChangeLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "changedById" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreProductPriceOverride_storeId_productId_key" ON "StoreProductPriceOverride"("storeId", "productId");

-- CreateIndex
CREATE INDEX "StoreProductPriceOverride_productId_idx" ON "StoreProductPriceOverride"("productId");

-- CreateIndex
CREATE INDEX "ProductChangeLog_productId_createdAt_idx" ON "ProductChangeLog"("productId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "StoreProductPriceOverride" ADD CONSTRAINT "StoreProductPriceOverride_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreProductPriceOverride" ADD CONSTRAINT "StoreProductPriceOverride_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductChangeLog" ADD CONSTRAINT "ProductChangeLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductChangeLog" ADD CONSTRAINT "ProductChangeLog_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
