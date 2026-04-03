import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCashStoreUser } from "@/lib/cash/routeAuth";
import { endOfLocalDay, parseLocalYMD, startOfLocalDay } from "@/lib/sales/dates";

export const runtime = "nodejs";

function parseRangeFromQuery(req: NextRequest) {
  const fromStr = req.nextUrl.searchParams.get("dateFrom");
  const toStr = req.nextUrl.searchParams.get("dateTo");

  const toD = toStr ? parseLocalYMD(toStr) : new Date();
  const fromD = fromStr ? parseLocalYMD(fromStr) : (() => { const d = new Date(); d.setDate(d.getDate() - 29); return d; })();

  if (!toD || !fromD) return { error: "Invalid date range" } as const;
  if (fromD.getTime() > toD.getTime()) return { error: "`dateFrom` must be <= `dateTo`" } as const;
  return { fromD, toD } as const;
}

export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const auth = await requireCashStoreUser(params.storeId);
  if (!auth.ok) return auth.response;

  const range = parseRangeFromQuery(req);
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });

  const registerId = req.nextUrl.searchParams.get("registerId")?.trim() || null;
  const dropType = req.nextUrl.searchParams.get("dropType") as
    | "safe_drop"
    | "bank_deposit"
    | "change_order_received"
    | null;

  const requestedEmployeeId = req.nextUrl.searchParams.get("employeeId")?.trim() || null;
  const effectiveEmployeeId = auth.user.role === "employee" ? auth.user.id : requestedEmployeeId;

  const from = startOfLocalDay(range.fromD);
  const to = endOfLocalDay(range.toD);

  const [registerClosures, drops] = await Promise.all([
    prisma.cashRegister.findMany({
      where: {
        storeId: params.storeId,
        status: "closed",
        closedAt: { gte: from, lte: to },
        ...(registerId ? { id: registerId } : {}),
        ...(effectiveEmployeeId ? { closedByEmployeeId: effectiveEmployeeId } : {}),
      },
      orderBy: { closedAt: "desc" },
      select: {
        id: true,
        registerName: true,
        closedAt: true,
        closedByEmployeeId: true,
        closingCashAmount: true,
        expectedClosingAmount: true,
        overShortAmount: true,
        closeVerifiedAt: true,
      },
    }),
    prisma.cashDrop.findMany({
      where: {
        storeId: params.storeId,
        droppedAt: { gte: from, lte: to },
        ...(registerId ? { registerId: registerId } : {}),
        ...(effectiveEmployeeId ? { employeeId: effectiveEmployeeId } : {}),
        ...(dropType ? { dropType } : {}),
      },
      orderBy: { droppedAt: "desc" },
      select: {
        id: true,
        registerId: true,
        amountDropped: true,
        dropType: true,
        employeeId: true,
        managerId: true,
        verified: true,
        droppedAt: true,
        notes: true,
        register: { select: { registerName: true } },
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    dateFrom: range.fromD.toISOString().slice(0, 10),
    dateTo: range.toD.toISOString().slice(0, 10),
    registerClosures,
    drops,
  });
}

