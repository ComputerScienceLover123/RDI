-- Add `currentExpectedCashAmount` to CashRegister

ALTER TABLE "CashRegister"
ADD COLUMN "currentExpectedCashAmount" NUMERIC(12,2) NOT NULL DEFAULT 0;

