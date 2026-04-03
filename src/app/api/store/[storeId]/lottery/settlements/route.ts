import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canManageLottery } from "@/lib/store/lotteryAccess";
import { parseLocalYMD } from "@/lib/sales/dates";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canManageLottery(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from")?.trim();
  const to = sp.get("to")?.trim();
  const game = sp.get("game")?.trim();
  const packNumber = sp.get("packNumber")?.trim();

  const where: Prisma.LotterySettlementWhereInput = { storeId };
  if (from || to) {
    where.settlementDate = {};
    if (from) {
      const d = parseLocalYMD(from);
      if (d) where.settlementDate.gte = d;
    }
    if (to) {
      const d = parseLocalYMD(to);
      if (d) {
        d.setHours(23, 59, 59, 999);
        where.settlementDate.lte = d;
      }
    }
  }
  if (game) {
    where.gameName = { contains: game, mode: "insensitive" };
  }
  if (packNumber) {
    where.pack = { packNumber: { contains: packNumber, mode: "insensitive" } };
  }

  const rows = await prisma.lotterySettlement.findMany({
    where,
    orderBy: { settlementDate: "desc" },
    take: 200,
    include: {
      pack: { select: { packNumber: true } },
      settledBy: { select: { firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({
    settlements: rows.map((r) => ({
      id: r.id,
      packNumber: r.pack.packNumber,
      gameName: r.gameName,
      ticketsSoldCount: r.ticketsSoldCount,
      ticketsRemainingCount: r.ticketsRemainingCount,
      expectedRevenue: r.expectedRevenue.toString(),
      actualCashCollected: r.actualCashCollected.toString(),
      overShortAmount: r.overShortAmount.toString(),
      warnLargeDiscrepancy: Number(r.overShortAmount.abs()) > 5,
      settlementDate: r.settlementDate.toISOString().slice(0, 10),
      settledByName: `${r.settledBy.firstName} ${r.settledBy.lastName}`,
      notes: r.notes,
    })),
  });
}
