import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireComplianceHistoryUser } from "@/lib/compliance/routeAuth";
import { employeeScorecard } from "@/lib/compliance/stats";
import { canViewStoreComplianceDashboard } from "@/lib/compliance/access";
import { endOfLocalDay, startOfLocalDay } from "@/lib/sales/dates";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const auth = await requireComplianceHistoryUser(params.storeId);
  if (!auth.ok) return auth.response;

  if (canViewStoreComplianceDashboard(auth.user, params.storeId)) {
    return NextResponse.json({ error: "Use /compliance/dashboard for managers and admins" }, { status: 403 });
  }

  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);
  const thirtyStart = new Date(todayStart);
  thirtyStart.setDate(thirtyStart.getDate() - 30);

  const take = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "50") || 50, 100);
  const cursor = req.nextUrl.searchParams.get("cursor");

  const uid = auth.user.id;
  const storeId = params.storeId;

  const [logs, summary, todayApproved, todayDeclined] = await Promise.all([
    prisma.ageVerificationLog.findMany({
      where: { storeId, employeeId: uid },
      orderBy: { verifiedAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        product: { select: { name: true, upc: true } },
      },
    }),
    employeeScorecard(storeId, uid, thirtyStart, todayEnd),
    prisma.ageVerificationLog.count({
      where: {
        storeId,
        employeeId: uid,
        verifiedAt: { gte: todayStart, lte: todayEnd },
        result: "approved",
      },
    }),
    prisma.ageVerificationLog.count({
      where: {
        storeId,
        employeeId: uid,
        verifiedAt: { gte: todayStart, lte: todayEnd },
        result: "declined",
      },
    }),
  ]);

  let nextCursor: string | null = null;
  let rows = logs;
  if (logs.length > take) {
    nextCursor = logs[take]!.id;
    rows = logs.slice(0, take);
  }

  return NextResponse.json({
    summary: {
      last30Days: summary,
      today: {
        approved: todayApproved,
        declined: todayDeclined,
        total: todayApproved + todayDeclined,
      },
    },
    logs: rows.map((l) => ({
      id: l.id,
      verifiedAt: l.verifiedAt.toISOString(),
      productName: l.product.name,
      productUpc: l.product.upc,
      method: l.method,
      result: l.result,
      declinedReason: l.declinedReason,
      customerAgeYears: l.customerAgeYears,
      transactionId: l.transactionId,
    })),
    nextCursor,
  });
}
