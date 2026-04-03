import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAccessStore } from "@/lib/store/storeAccess";
import { canViewManagerHomeData } from "@/lib/store/homeAccess";
import { endOfLocalDay, startOfLocalDay } from "@/lib/sales/dates";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canAccessStore(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canViewManagerHomeData(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const todayStart = startOfLocalDay(new Date());
  const todayEnd = endOfLocalDay(new Date());

  const rows = await prisma.posTransaction.findMany({
    where: {
      storeId,
      type: "sale",
      transactionAt: { gte: todayStart, lte: todayEnd },
    },
    select: { transactionAt: true, total: true },
  });

  const dollarsByHour = Array.from({ length: 24 }, () => 0);
  for (const r of rows) {
    const h = r.transactionAt.getHours();
    dollarsByHour[h] += Number(r.total);
  }

  const nowHour = new Date().getHours();
  const points = dollarsByHour.slice(0, nowHour + 1).map((salesDollars, hour) => ({
    hour,
    salesDollars: Math.round(salesDollars * 100) / 100,
  }));

  return NextResponse.json({ points });
}
