import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAdminLottery } from "@/lib/store/lotteryAccess";
import { formatLocalYMD } from "@/lib/sales/dates";
import { utcNoonFromYmd } from "@/lib/fuel/dates";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!canAdminLottery(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const fromRaw = sp.get("from")?.trim();
  const toRaw = sp.get("to")?.trim();
  const sort = sp.get("sort") === "name" ? "name" : "overShort";

  const toD = new Date();
  const fromD = new Date(toD);
  fromD.setDate(fromD.getDate() - 29);

  const toStr = toRaw || formatLocalYMD(toD);
  const fromStr = fromRaw || formatLocalYMD(fromD);

  const rangeStart = utcNoonFromYmd(fromStr);
  const rangeEnd = utcNoonFromYmd(toStr);

  const stores = await prisma.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const rows = await Promise.all(
    stores.map(async (s) => {
      const [settledCount, overAgg, staleCount] = await Promise.all([
        prisma.lotterySettlement.count({
          where: {
            storeId: s.id,
            settlementDate: { gte: rangeStart, lte: rangeEnd },
          },
        }),
        prisma.lotterySettlement.aggregate({
          where: {
            storeId: s.id,
            settlementDate: { gte: rangeStart, lte: rangeEnd },
          },
          _sum: { overShortAmount: true },
        }),
        prisma.lotteryPack.count({
          where: {
            storeId: s.id,
            status: "activated",
            activatedAt: { lt: fourteenDaysAgo },
          },
        }),
      ]);

      const totalOverShort = overAgg._sum.overShortAmount ?? new Prisma.Decimal(0);

      return {
        storeId: s.id,
        storeName: s.name,
        packsSettledInRange: settledCount,
        totalOverShort: totalOverShort.toString(),
        staleActivePacks: staleCount,
      };
    }),
  );

  const sorted =
    sort === "name" ?
      [...rows].sort((a, b) => a.storeName.localeCompare(b.storeName))
    : [...rows].sort((a, b) => Number(b.totalOverShort) - Number(a.totalOverShort));

  return NextResponse.json({
    from: fromStr,
    to: toStr,
    stores: sorted,
  });
}
