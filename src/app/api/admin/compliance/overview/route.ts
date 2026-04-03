import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { complianceLogsForRange, countAgeRestrictedGapsInRange, employeeScorecard } from "@/lib/compliance/stats";
import { parseRangeQuery } from "@/lib/sales/dates";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const range = parseRangeQuery(sp.get("dateFrom"), sp.get("dateTo"));
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });

  const detailStoreId = sp.get("storeId")?.trim() ?? null;

  const stores = await prisma.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  const rows = await Promise.all(
    stores.map(async (s) => {
      const [logs, gaps] = await Promise.all([
        complianceLogsForRange(s.id, range.from, range.to),
        countAgeRestrictedGapsInRange(s.id, range.from, range.to),
      ]);
      const rate = logs.total > 0 ? Math.round((logs.approved / logs.total) * 10000) / 100 : null;
      const flagged = gaps > 0 || (logs.total > 0 && rate !== null && rate < 100);
      return {
        storeId: s.id,
        storeName: s.name,
        approved: logs.approved,
        declined: logs.declined,
        totalVerifications: logs.total,
        complianceRatePercent: rate,
        ageRestrictedGapCount: gaps,
        flagged,
      };
    })
  );

  let employeeScorecards: Array<{
    employeeId: string;
    name: string;
    role: string;
    ageRestrictedLineCount: number;
    approvedVerifications: number;
    declinedVerifications: number;
    gapCount: number;
    verificationRate: number | null;
  }> | null = null;

  if (detailStoreId) {
    const okStore = stores.some((s) => s.id === detailStoreId);
    if (okStore) {
      const employees = await prisma.user.findMany({
        where: {
          assignedStoreId: detailStoreId,
          accountStatus: "active",
          role: { in: ["employee", "manager"] },
        },
        select: { id: true, firstName: true, lastName: true, role: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });
      employeeScorecards = await Promise.all(
        employees.map(async (e) => {
          const card = await employeeScorecard(detailStoreId, e.id, range.from, range.to);
          return {
            employeeId: e.id,
            name: `${e.firstName} ${e.lastName}`.trim(),
            role: e.role,
            ...card,
          };
        })
      );
    }
  }

  return NextResponse.json({
    dateRange: { from: range.fromStr, to: range.toStr },
    stores: rows,
    ...(employeeScorecards !== null ? { employeeScorecards } : {}),
  });
}
