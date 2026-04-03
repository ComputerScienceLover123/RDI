import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireComplianceDashboardUser } from "@/lib/compliance/routeAuth";
import { complianceLogsForRange, build30DayTrend, employeeScorecard } from "@/lib/compliance/stats";
import { endOfLocalDay, startOfLocalDay } from "@/lib/sales/dates";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const auth = await requireComplianceDashboardUser(params.storeId);
  if (!auth.ok) return auth.response;

  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);

  const [todayLogs, trend, employees] = await Promise.all([
    complianceLogsForRange(params.storeId, todayStart, todayEnd),
    build30DayTrend(params.storeId, now),
    prisma.user.findMany({
      where: {
        assignedStoreId: params.storeId,
        accountStatus: "active",
        role: { in: ["employee", "manager"] },
      },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);

  const thirtyStart = new Date(todayStart);
  thirtyStart.setDate(thirtyStart.getDate() - 30);

  const scorecards = await Promise.all(
    employees.map(async (e) => {
      const card = await employeeScorecard(params.storeId, e.id, thirtyStart, todayEnd);
      return {
        employeeId: e.id,
        name: `${e.firstName} ${e.lastName}`.trim(),
        role: e.role,
        ...card,
      };
    })
  );

  const todayRate =
    todayLogs.total > 0 ? Math.round((todayLogs.approved / todayLogs.total) * 10000) / 100 : null;

  return NextResponse.json({
    today: {
      approvedVerifications: todayLogs.approved,
      declinedVerifications: todayLogs.declined,
      totalVerifications: todayLogs.total,
      complianceRatePercent: todayRate,
    },
    trend30d: trend,
    employeeScorecards: scorecards,
  });
}
