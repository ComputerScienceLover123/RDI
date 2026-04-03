-- Cash management module (registers, drops, counts)

-- Notification preference category
ALTER TYPE "NotificationCategory" ADD VALUE 'cash';
ALTER TABLE "UserNotificationPreference" ADD COLUMN "cash" BOOLEAN NOT NULL DEFAULT true;

-- Enums
DO $$ BEGIN
  CREATE TYPE "CashRegisterStatus" AS ENUM ('open', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CashDropType" AS ENUM ('safe_drop', 'bank_deposit', 'change_order_received');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CashCountType" AS ENUM ('register_open', 'register_close', 'safe_count', 'mid_shift_count');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Cash registers
CREATE TABLE "CashRegister" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "registerName" TEXT NOT NULL,
  "status" "CashRegisterStatus" NOT NULL DEFAULT 'open',

  "openedByEmployeeId" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL,

  "closedByEmployeeId" TEXT,
  "closedAt" TIMESTAMP(3),

  "openingCashCountId" TEXT,
  "closingCashCountId" TEXT,

  "openingCashAmount" NUMERIC(12,2) NOT NULL,
  "closingCashAmount" NUMERIC(12,2),
  "expectedClosingAmount" NUMERIC(12,2),
  "overShortAmount" NUMERIC(12,2),

  "closeVerifiedByManagerId" TEXT,
  "closeVerifiedAt" TIMESTAMP(3),

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CashRegister_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashRegister_openingCashCountId_key" ON "CashRegister"("openingCashCountId");
CREATE UNIQUE INDEX "CashRegister_closingCashCountId_key" ON "CashRegister"("closingCashCountId");

CREATE INDEX "CashRegister_storeId_idx" ON "CashRegister"("storeId");
CREATE INDEX "CashRegister_status_idx" ON "CashRegister"("status");

ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_openedByEmployeeId_fkey" FOREIGN KEY ("openedByEmployeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_closedByEmployeeId_fkey" FOREIGN KEY ("closedByEmployeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashRegister_closeVerifiedByManagerId_fkey" FOREIGN KEY ("closeVerifiedByManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cash counts
CREATE TABLE "CashCount" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "registerId" TEXT,
  "countType" "CashCountType" NOT NULL,

  "totalCountedAmount" NUMERIC(12,2) NOT NULL,
  "countedByEmployeeId" TEXT NOT NULL,

  "verifiedByManagerId" TEXT,
  "verifiedAt" TIMESTAMP(3),

  "denominationBreakdown" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "coinsTotal" NUMERIC(12,2) NOT NULL,
  "billsTotal" NUMERIC(12,2) NOT NULL,

  "timestamp" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CashCount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashCount_storeId_timestamp_idx" ON "CashCount"("storeId", "timestamp");
CREATE INDEX "CashCount_countType_idx" ON "CashCount"("countType");

ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "CashRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_countedByEmployeeId_fkey" FOREIGN KEY ("countedByEmployeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashCount" ADD CONSTRAINT "CashCount_verifiedByManagerId_fkey" FOREIGN KEY ("verifiedByManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cash drops
CREATE TABLE "CashDrop" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "registerId" TEXT NOT NULL,
  "amountDropped" NUMERIC(12,2) NOT NULL,
  "dropType" "CashDropType" NOT NULL,

  "employeeId" TEXT NOT NULL,
  "managerId" TEXT,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP(3),

  "droppedAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,

  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CashDrop_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashDrop_storeId_droppedAt_idx" ON "CashDrop"("storeId", "droppedAt");
CREATE INDEX "CashDrop_registerId_idx" ON "CashDrop"("registerId");
CREATE INDEX "CashDrop_employeeId_idx" ON "CashDrop"("employeeId");

ALTER TABLE "CashDrop" ADD CONSTRAINT "CashDrop_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashDrop" ADD CONSTRAINT "CashDrop_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "CashRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashDrop" ADD CONSTRAINT "CashDrop_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashDrop" ADD CONSTRAINT "CashDrop_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Link CashRegister open/close count IDs
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_openingCashCountId_fkey" FOREIGN KEY ("openingCashCountId") REFERENCES "CashCount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashRegister" ADD CONSTRAINT "CashRegister_closingCashCountId_fkey" FOREIGN KEY ("closingCashCountId") REFERENCES "CashCount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
