import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCashVerifier } from "@/lib/cash/routeAuth";
import { calcSafeExpectedBalance } from "@/lib/cash/calc";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const auth = await requireCashVerifier(params.storeId);
  if (!auth.ok) return auth.response;

  const now = new Date();
  const expected = await calcSafeExpectedBalance({ storeId: params.storeId, safeCountAt: now });

  const lastSafe = await prisma.cashCount.findFirst({
    where: { storeId: params.storeId, registerId: null, countType: "safe_count" },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true, totalCountedAmount: true, denominationBreakdown: true },
  });

  return NextResponse.json({
    expectedSafeBalance: expected.expectedSafeBalance.toFixed(2),
    lastSafeCountAt: lastSafe ? lastSafe.timestamp.toISOString() : null,
    lastSafeCountTotal: lastSafe ? lastSafe.totalCountedAmount.toFixed(2) : "0.00",
    lastSafeDenominationBreakdown: lastSafe?.denominationBreakdown ?? null,
    safeDrops: expected.safeDrops.toFixed(2),
    bankDeposits: expected.bankDeposits.toFixed(2),
    changeOrdersReceived: expected.changeOrdersReceived.toFixed(2),
    lastSafeCountExists: !!lastSafe,
  });
}

