import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { parseRangeQuery } from "@/lib/sales/dates";
import { calcSafeExpectedBalanceBeforeTimestamp } from "@/lib/cash/calc";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const range = parseRangeQuery(req.nextUrl.searchParams.get("dateFrom"), req.nextUrl.searchParams.get("dateTo"));
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });

  const registers = await prisma.cashRegister.findMany({
    where: {
      storeId: params.storeId,
      status: "closed",
      closedAt: { gte: range.from, lte: range.to },
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
      closedByEmployee: { select: { firstName: true, lastName: true } },
      openedByEmployee: { select: { firstName: true, lastName: true } },
    },
  });

  const lastSafe = await prisma.cashCount.findFirst({
    where: { storeId: params.storeId, registerId: null, countType: "safe_count", timestamp: { lte: range.to } },
    orderBy: { timestamp: "desc" },
    select: { id: true, timestamp: true, totalCountedAmount: true },
  });

  let safe: null | {
    lastSafeCountId: string;
    timestamp: string;
    countedSafeBalance: string;
    expectedSafeBalanceBefore: string;
    mismatchAmount: string;
  } = null;

  if (lastSafe) {
    const expectedBefore = await calcSafeExpectedBalanceBeforeTimestamp({
      storeId: params.storeId,
      safeCountAt: lastSafe.timestamp,
    });
    const mismatch = lastSafe.totalCountedAmount.sub(expectedBefore.expectedSafeBalance);
    safe = {
      lastSafeCountId: lastSafe.id,
      timestamp: lastSafe.timestamp.toISOString(),
      countedSafeBalance: lastSafe.totalCountedAmount.toFixed(2),
      expectedSafeBalanceBefore: expectedBefore.expectedSafeBalance.toFixed(2),
      mismatchAmount: mismatch.toFixed(2),
    };
  }

  return NextResponse.json({
    ok: true,
    dateRange: { from: range.fromStr, to: range.toStr },
    registers: registers.map((r) => ({
      id: r.id,
      registerName: r.registerName,
      openedAt: r.openedAt.toISOString(),
      openedByEmployeeName: r.openedByEmployee ? `${r.openedByEmployee.firstName} ${r.openedByEmployee.lastName}`.trim() : r.openedByEmployeeId,
      closedAt: r.closedAt ? r.closedAt.toISOString() : null,
      closedByEmployeeName: r.closedByEmployee ? `${r.closedByEmployee.firstName} ${r.closedByEmployee.lastName}`.trim() : r.closedByEmployeeId,
      closingCashAmount: r.closingCashAmount?.toFixed(2) ?? null,
      expectedClosingAmount: r.expectedClosingAmount?.toFixed(2) ?? null,
      overShortAmount: r.overShortAmount?.toFixed(2) ?? null,
      verified: !!r.closeVerifiedAt,
    })),
    safe,
  });
}

