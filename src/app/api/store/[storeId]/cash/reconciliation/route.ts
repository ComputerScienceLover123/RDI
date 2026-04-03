import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCashStoreUser } from "@/lib/cash/routeAuth";
import { endOfLocalDay, formatLocalYMD, parseLocalYMD, startOfLocalDay } from "@/lib/sales/dates";
import { calcSafeExpectedBalanceBeforeTimestamp } from "@/lib/cash/calc";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const auth = await requireCashStoreUser(params.storeId);
  if (!auth.ok) return auth.response;

  const dateParam = req.nextUrl.searchParams.get("date");
  const parsedDate = dateParam ? parseLocalYMD(dateParam) : null;
  const dayStart = parsedDate ? startOfLocalDay(parsedDate) : startOfLocalDay(new Date());
  const dayEnd = parsedDate ? endOfLocalDay(parsedDate) : endOfLocalDay(new Date());
  const dayYmd = formatLocalYMD(dayStart);

  const [registers, totalSafeDropsAgg, lastSafeCount] = await Promise.all([
    prisma.cashRegister.findMany({
      where: {
        storeId: params.storeId,
        status: "closed",
        openedAt: { gte: dayStart, lte: dayEnd },
        closedAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { closedAt: "desc" },
      select: {
        id: true,
        registerName: true,
        openedAt: true,
        openedByEmployeeId: true,
        closedAt: true,
        closedByEmployeeId: true,
        closingCashAmount: true,
        expectedClosingAmount: true,
        overShortAmount: true,
        closeVerifiedAt: true,
      },
    }),
    prisma.cashDrop.aggregate({
      where: {
        storeId: params.storeId,
        dropType: "safe_drop",
        droppedAt: { gte: dayStart, lte: dayEnd },
      },
      _sum: { amountDropped: true },
    }),
    prisma.cashCount.findFirst({
      where: { storeId: params.storeId, registerId: null, countType: "safe_count", timestamp: { lte: dayEnd } },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true, totalCountedAmount: true, denominationBreakdown: true },
    }),
  ]);

  const totalSafeDrops = totalSafeDropsAgg._sum.amountDropped ?? new Prisma.Decimal(0);

  // For safe expected vs counted, use the "right before" expected at the time of the last safe count.
  let safeExpectedSafeBalance: string | null = null;
  let safeExpectedBaseAt: string | null = null;
  let safeCountedBalance: string | null = null;
  let safeDenomBreakdown: unknown | null = null;

  if (lastSafeCount) {
    const expectedBefore = await calcSafeExpectedBalanceBeforeTimestamp({
      storeId: params.storeId,
      safeCountAt: lastSafeCount.timestamp,
    });
    safeExpectedSafeBalance = expectedBefore.expectedSafeBalance.toFixed(2);
    safeExpectedBaseAt = expectedBefore.lastSafeCountAt ? expectedBefore.lastSafeCountAt.toISOString() : null;
    safeCountedBalance = lastSafeCount.totalCountedAmount.toFixed(2);
    safeDenomBreakdown = lastSafeCount.denominationBreakdown;
  }

  const totalCashOverShort = registers.reduce((acc, r) => {
    const os = r.overShortAmount;
    return acc + (os ? os.toNumber() : 0);
  }, 0);

  return NextResponse.json({
    ok: true,
    date: dayYmd,
    registers,
    totalSafeDrops: totalSafeDrops.toFixed(2),
    safe: lastSafeCount
      ? {
          expectedSafeBalance: safeExpectedSafeBalance,
          expectedBaseAt: safeExpectedBaseAt,
          countedSafeBalance: safeCountedBalance,
          denominationBreakdown: safeDenomBreakdown,
        }
      : null,
    storeTotalCashOverShort: totalCashOverShort.toFixed(2),
  });
}

