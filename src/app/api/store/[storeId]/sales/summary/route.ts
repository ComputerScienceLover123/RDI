import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreSalesUser } from "@/lib/sales/salesRoute";
import { endOfLocalDay, formatLocalYMD, startOfLocalDay } from "@/lib/sales/dates";
import { decN } from "@/lib/sales/money";

export const runtime = "nodejs";

async function saleMetrics(storeId: string, start: Date, end: Date) {
  const agg = await prisma.posTransaction.aggregate({
    where: { storeId, type: "sale", transactionAt: { gte: start, lte: end } },
    _sum: { total: true },
    _count: true,
  });
  const total = decN(agg._sum.total);
  const count = agg._count;
  const avg = count > 0 ? total / count : 0;
  return { total, count, avg };
}

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const auth = await requireStoreSalesUser(params.storeId);
  if (!auth.ok) return auth.response;

  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);

  const lastWeekStart = new Date(todayStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(todayEnd);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

  const [todayM, lastWeekM, mtdAgg, todayVoidRefund, priorDayCounts] = await Promise.all([
    saleMetrics(params.storeId, todayStart, todayEnd),
    saleMetrics(params.storeId, lastWeekStart, lastWeekEnd),
    prisma.posTransaction.aggregate({
      where: {
        storeId: params.storeId,
        type: "sale",
        transactionAt: { gte: monthStart, lte: todayEnd },
      },
      _sum: { total: true },
    }),
    prisma.posTransaction.count({
      where: {
        storeId: params.storeId,
        type: { in: ["void", "refund"] },
        transactionAt: { gte: todayStart, lte: todayEnd },
      },
    }),
    Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const day = i + 1;
        const s = new Date(todayStart);
        s.setDate(s.getDate() - day);
        const e = endOfLocalDay(s);
        return prisma.posTransaction.count({
          where: {
            storeId: params.storeId,
            type: { in: ["void", "refund"] },
            transactionAt: { gte: s, lte: e },
          },
        });
      })
    ),
  ]);

  const mtdTotal = decN(mtdAgg._sum.total);
  const avgVoidRefundPrior = priorDayCounts.reduce((a, b) => a + b, 0) / 7;

  let salesPctVsLastWeek: number | null = null;
  if (lastWeekM.total > 0) {
    salesPctVsLastWeek = ((todayM.total - lastWeekM.total) / lastWeekM.total) * 100;
  } else if (todayM.total > 0) {
    salesPctVsLastWeek = 100;
  }

  const voidRefundWarning =
    todayVoidRefund > 0 &&
    (avgVoidRefundPrior === 0
      ? todayVoidRefund >= 3
      : todayVoidRefund >= Math.max(avgVoidRefundPrior * 1.75, avgVoidRefundPrior + 2));

  return NextResponse.json({
    asOf: formatLocalYMD(now),
    today: {
      totalSales: todayM.total,
      transactionCount: todayM.count,
      averageTransaction: todayM.avg,
    },
    sameWeekdayLastWeek: {
      totalSales: lastWeekM.total,
      transactionCount: lastWeekM.count,
    },
    salesPctChangeVsSameWeekdayLastWeek: salesPctVsLastWeek,
    monthToDate: {
      totalSales: mtdTotal,
      monthLabel: `${todayStart.getFullYear()}-${String(todayStart.getMonth() + 1).padStart(2, "0")}`,
    },
    voidRefundAlert: {
      todayCount: todayVoidRefund,
      priorSevenDayAvgDaily: Math.round(avgVoidRefundPrior * 100) / 100,
      warning: voidRefundWarning,
    },
  });
}
