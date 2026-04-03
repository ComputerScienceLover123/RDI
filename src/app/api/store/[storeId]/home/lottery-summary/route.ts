import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canViewManagerHomeData } from "@/lib/store/homeAccess";
import { canAccessStore } from "@/lib/store/storeAccess";
import { formatLocalYMD } from "@/lib/sales/dates";
import { utcNoonFromYmd } from "@/lib/fuel/dates";
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

  const ymd = formatLocalYMD(new Date());
  const summaryDate = utcNoonFromYmd(ymd);
  const dayStart = startOfLocalDay(new Date());
  const dayEnd = endOfLocalDay(new Date());

  const [activatedToday, settledToday, todaySettlements] = await Promise.all([
    prisma.lotteryPack.count({
      where: {
        storeId,
        activatedAt: { gte: dayStart, lte: dayEnd },
      },
    }),
    prisma.lotteryPack.count({
      where: {
        storeId,
        status: "settled",
        settledAt: { gte: dayStart, lte: dayEnd },
      },
    }),
    prisma.lotterySettlement.findMany({
      where: {
        storeId,
        settlementDate: summaryDate,
      },
      select: { overShortAmount: true },
    }),
  ]);

  let todayTotalOverShort = 0;
  for (const s of todaySettlements) {
    todayTotalOverShort += Number(s.overShortAmount);
  }

  return NextResponse.json({
    todayPacksActivated: activatedToday,
    todayPacksSettled: settledToday,
    todayTotalOverShort: Math.round(todayTotalOverShort * 100) / 100,
  });
}
