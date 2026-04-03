import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAccessStore } from "@/lib/store/storeAccess";
import { canViewManagerHomeData } from "@/lib/store/homeAccess";
import { endOfLocalDay, startOfLocalDay } from "@/lib/sales/dates";
import { decN } from "@/lib/sales/money";

export const runtime = "nodejs";

async function saleTotalAndCount(storeId: string, start: Date, end: Date) {
  const agg = await prisma.posTransaction.aggregate({
    where: { storeId, type: "sale", transactionAt: { gte: start, lte: end } },
    _sum: { total: true },
    _count: true,
  });
  return { total: decN(agg._sum.total), count: agg._count };
}

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canAccessStore(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canViewManagerHomeData(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);
  const lastWeekDay = new Date(todayStart);
  lastWeekDay.setDate(lastWeekDay.getDate() - 7);
  const lastWeekStart = startOfLocalDay(lastWeekDay);
  const lastWeekEnd = endOfLocalDay(lastWeekDay);

  const [
    todaySales,
    lastWeekSales,
    lowStockRows,
    openPurchaseOrders,
    wasteRows,
    unreadStoreNotifications,
  ] = await Promise.all([
    saleTotalAndCount(storeId, todayStart, todayEnd),
    saleTotalAndCount(storeId, lastWeekStart, lastWeekEnd),
    prisma.$queryRaw<[{ c: bigint }]>`
      SELECT COUNT(*)::bigint AS c FROM "Inventory"
      WHERE "storeId" = ${storeId} AND "quantityOnHand" <= "minStockThreshold"
    `,
    prisma.purchaseOrder.count({
      where: { storeId, status: "submitted" },
    }),
    prisma.foodserviceWasteLog.findMany({
      where: { storeId, createdAt: { gte: todayStart, lte: todayEnd } },
      include: { menuItem: { select: { retailPrice: true } } },
    }),
    prisma.notification.count({
      where: {
        recipientUserId: user.id,
        read: false,
        OR: [{ storeId }, { storeId: null }],
      },
    }),
  ]);

  const lowStock = Number(lowStockRows[0]?.c ?? 0);

  let wasteCount = 0;
  let wasteDollars = 0;
  for (const w of wasteRows) {
    wasteCount += w.quantity;
    wasteDollars += w.quantity * Number(w.menuItem.retailPrice);
  }

  let salesPctVsLastWeek: number | null = null;
  if (lastWeekSales.total > 0) {
    salesPctVsLastWeek = ((todaySales.total - lastWeekSales.total) / lastWeekSales.total) * 100;
  } else if (todaySales.total > 0) {
    salesPctVsLastWeek = 100;
  }

  return NextResponse.json({
    todaySalesTotal: Math.round(todaySales.total * 100) / 100,
    salesPctVsSameDayLastWeek: salesPctVsLastWeek == null ? null : Math.round(salesPctVsLastWeek * 10) / 10,
    todayTransactionCount: todaySales.count,
    lowStockProductCount: lowStock,
    activePurchaseOrdersSubmitted: openPurchaseOrders,
    foodserviceWasteUnitsToday: wasteCount,
    foodserviceWasteDollarsToday: Math.round(wasteDollars * 100) / 100,
    unreadNotificationsCount: unreadStoreNotifications,
  });
}
