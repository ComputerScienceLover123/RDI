-- Age-restricted product flags
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "ageRestricted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "minimumAge" INTEGER NOT NULL DEFAULT 21;

-- Notification category + user preference
ALTER TYPE "NotificationCategory" ADD VALUE 'compliance';
ALTER TABLE "UserNotificationPreference" ADD COLUMN IF NOT EXISTS "compliance" BOOLEAN NOT NULL DEFAULT true;

-- Enums for age verification
CREATE TYPE "AgeVerificationMethod" AS ENUM ('visual_check', 'id_scanned', 'id_manual_entry');
CREATE TYPE "AgeVerificationIdType" AS ENUM ('drivers_license', 'state_id', 'passport', 'military_id');
CREATE TYPE "AgeVerificationResult" AS ENUM ('approved', 'declined');
CREATE TYPE "AgeDeclinedReason" AS ENUM ('underage', 'expired_id', 'no_id_present', 'other');

CREATE TABLE "AgeVerificationLog" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "transactionId" TEXT,
    "lineItemId" TEXT,
    "productId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "method" "AgeVerificationMethod" NOT NULL,
    "customerDob" DATE,
    "customerAgeYears" INTEGER,
    "idType" "AgeVerificationIdType",
    "result" "AgeVerificationResult" NOT NULL,
    "declinedReason" "AgeDeclinedReason",
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgeVerificationLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgeVerificationLog_lineItemId_key" ON "AgeVerificationLog"("lineItemId");

CREATE INDEX "AgeVerificationLog_storeId_verifiedAt_idx" ON "AgeVerificationLog"("storeId", "verifiedAt");
CREATE INDEX "AgeVerificationLog_employeeId_verifiedAt_idx" ON "AgeVerificationLog"("employeeId", "verifiedAt");
CREATE INDEX "AgeVerificationLog_transactionId_idx" ON "AgeVerificationLog"("transactionId");
CREATE INDEX "AgeVerificationLog_productId_idx" ON "AgeVerificationLog"("productId");

ALTER TABLE "AgeVerificationLog" ADD CONSTRAINT "AgeVerificationLog_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgeVerificationLog" ADD CONSTRAINT "AgeVerificationLog_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgeVerificationLog" ADD CONSTRAINT "AgeVerificationLog_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "TransactionLineItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgeVerificationLog" ADD CONSTRAINT "AgeVerificationLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgeVerificationLog" ADD CONSTRAINT "AgeVerificationLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
