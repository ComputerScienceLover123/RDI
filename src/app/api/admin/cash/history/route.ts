import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { parseRangeQuery } from "@/lib/sales/dates";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const range = parseRangeQuery(req.nextUrl.searchParams.get("dateFrom"), req.nextUrl.searchParams.get("dateTo"));
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });

  const storeId = req.nextUrl.searchParams.get("storeId")?.trim() || null;
  const registerId = req.nextUrl.searchParams.get("registerId")?.trim() || null;
  const employeeId = req.nextUrl.searchParams.get("employeeId")?.trim() || null;
  const dropType = req.nextUrl.searchParams.get("dropType") as
    | "safe_drop"
    | "bank_deposit"
    | "change_order_received"
    | null;

  const [cashDrops, registerClosures] = await Promise.all([
    prisma.cashDrop.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        droppedAt: { gte: range.from, lte: range.to },
        ...(registerId ? { registerId } : {}),
        ...(employeeId ? { employeeId } : {}),
        ...(dropType ? { dropType } : {}),
      },
      orderBy: { droppedAt: "desc" },
      select: {
        id: true,
        storeId: true,
        registerId: true,
        register: { select: { registerName: true } },
        amountDropped: true,
        dropType: true,
        employeeId: true,
        managerId: true,
        verified: true,
        droppedAt: true,
        notes: true,
      },
    }),
    prisma.cashRegister.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        status: "closed",
        closedAt: { gte: range.from, lte: range.to },
        ...(registerId ? { id: registerId } : {}),
        ...(employeeId ? { closedByEmployeeId: employeeId } : {}),
      },
      orderBy: { closedAt: "desc" },
      select: {
        id: true,
        storeId: true,
        registerName: true,
        closedAt: true,
        closedByEmployeeId: true,
        overShortAmount: true,
        closeVerifiedAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    dateRange: { from: range.fromStr, to: range.toStr },
    cashDrops: cashDrops.map((d) => ({
      ...d,
      amountDropped: d.amountDropped.toFixed(2),
      droppedAt: d.droppedAt.toISOString(),
    })),
    registerClosures: registerClosures.map((r) => ({
      ...r,
      overShortAmount: r.overShortAmount?.toFixed(2) ?? null,
      closedAt: r.closedAt ? r.closedAt.toISOString() : null,
      verified: !!r.closeVerifiedAt,
    })),
  });
}

