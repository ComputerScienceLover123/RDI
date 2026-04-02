import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/sales/salesRoute";
import { endOfLocalDay, startOfLocalDay } from "@/lib/sales/dates";
import { decN } from "@/lib/sales/money";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminUser();
  if (!auth.ok) return auth.response;

  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

  const stores = await prisma.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  const summaries = await Promise.all(
    stores.map(async (s) => {
      const [todayAgg, mtdAgg, todaySaleCount] = await Promise.all([
        prisma.posTransaction.aggregate({
          where: { storeId: s.id, type: "sale", transactionAt: { gte: todayStart, lte: todayEnd } },
          _sum: { total: true },
        }),
        prisma.posTransaction.aggregate({
          where: { storeId: s.id, type: "sale", transactionAt: { gte: monthStart, lte: todayEnd } },
          _sum: { total: true },
        }),
        prisma.posTransaction.count({
          where: { storeId: s.id, type: "sale", transactionAt: { gte: todayStart, lte: todayEnd } },
        }),
      ]);
      return {
        storeId: s.id,
        storeName: s.name,
        todaySales: Math.round(decN(todayAgg._sum.total) * 100) / 100,
        monthToDateSales: Math.round(decN(mtdAgg._sum.total) * 100) / 100,
        todayTransactionCount: todaySaleCount,
      };
    })
  );

  return NextResponse.json({ stores: summaries });
}
