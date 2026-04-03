import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCashStoreUser } from "@/lib/cash/routeAuth";
import { calcSafeExpectedBalance } from "@/lib/cash/calc";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const auth = await requireCashStoreUser(params.storeId);
  if (!auth.ok) return auth.response;

  const now = new Date();
  const isManagerOrAdmin =
    auth.user.role === "admin" || (auth.user.role === "manager" && auth.user.assignedStoreId === params.storeId);

  const openRegisters = await prisma.cashRegister.findMany({
    where: { storeId: params.storeId, status: "open" },
    orderBy: { openedAt: "desc" },
    take: 10,
    select: { id: true, registerName: true, openedAt: true, openingCashAmount: true, currentExpectedCashAmount: true, status: true },
  });

  const pendingClose = isManagerOrAdmin
    ? await prisma.cashRegister.findMany({
        where: { storeId: params.storeId, status: "closed", closeVerifiedAt: null },
        orderBy: { closedAt: "desc" },
        take: 20,
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
      })
    : [];

  const pendingDrops = isManagerOrAdmin
    ? await prisma.cashDrop.findMany({
        where: { storeId: params.storeId, verified: false },
        orderBy: { droppedAt: "desc" },
        take: 20,
        include: {
          register: { select: { registerName: true } },
          employee: { select: { firstName: true, lastName: true } },
        },
      })
    : [];

  let safe:
    | null
    | {
        expectedSafeBalance: string;
        lastSafeCountAt: string | null;
        lastSafeCountTotal: string | null;
        lastSafeDenominationBreakdown: unknown | null;
      } = null;

  if (isManagerOrAdmin) {
    const expected = await calcSafeExpectedBalance({ storeId: params.storeId, safeCountAt: now });
    const lastSafeCount = await prisma.cashCount.findFirst({
      where: { storeId: params.storeId, registerId: null, countType: "safe_count" },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true, totalCountedAmount: true, denominationBreakdown: true },
    });
    safe = {
      expectedSafeBalance: expected.expectedSafeBalance.toFixed(2),
      lastSafeCountAt: lastSafeCount ? lastSafeCount.timestamp.toISOString() : null,
      lastSafeCountTotal: lastSafeCount ? lastSafeCount.totalCountedAmount.toFixed(2) : null,
      lastSafeDenominationBreakdown: lastSafeCount ? lastSafeCount.denominationBreakdown : null,
    };
  }

  return NextResponse.json({
    role: auth.user.role,
    openRegisters,
    pendingClose,
    pendingDrops: pendingDrops.map((d) => ({
      id: d.id,
      registerId: d.registerId,
      registerName: d.register.registerName,
      amountDropped: d.amountDropped.toFixed(2),
      dropType: d.dropType,
      employeeName: `${d.employee.firstName} ${d.employee.lastName}`.trim(),
      droppedAt: d.droppedAt.toISOString(),
      notes: d.notes,
    })),
    safe,
  });
}

