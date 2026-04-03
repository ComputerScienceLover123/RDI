import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canManageLottery } from "@/lib/store/lotteryAccess";
import { recordLotterySettlement } from "@/lib/lottery/dailySummary";
import { formatLocalYMD } from "@/lib/sales/dates";
import { utcNoonFromYmd } from "@/lib/fuel/dates";
import { getManagerAdminUserIdsForStore } from "@/lib/alerts/recipients";
import { categoryAllowedByPreference, getOrCreateNotificationPreferences } from "@/lib/alerts/preferences";

export const runtime = "nodejs";

const bodySchema = z.object({
  packId: z.string().min(1),
  ticketsRemaining: z.number().int().min(0),
  actualCashCollected: z.number().nonnegative(),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canManageLottery(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const { packId, ticketsRemaining, actualCashCollected, notes } = parsed.data;

  const pack = await prisma.lotteryPack.findFirst({
    where: { id: packId, storeId },
  });
  if (!pack || pack.status !== "activated") {
    return NextResponse.json({ error: "Pack not found or not activated" }, { status: 400 });
  }
  if (ticketsRemaining > pack.ticketCountPerPack) {
    return NextResponse.json({ error: "Tickets remaining cannot exceed pack size" }, { status: 400 });
  }

  const ticketsSold = pack.ticketCountPerPack - ticketsRemaining;
  const price = pack.ticketPrice;
  const expected = price.mul(new Prisma.Decimal(ticketsSold));
  const actual = new Prisma.Decimal(actualCashCollected.toFixed(2));
  const overShort = actual.sub(expected);

  const settlementDate = utcNoonFromYmd(formatLocalYMD(new Date()));

  const result = await prisma.$transaction(async (tx) => {
    const settlement = await tx.lotterySettlement.create({
      data: {
        storeId,
        packId: pack.id,
        gameName: pack.gameName,
        totalTicketsInPack: pack.ticketCountPerPack,
        ticketsSoldCount: ticketsSold,
        ticketsRemainingCount: ticketsRemaining,
        expectedRevenue: expected,
        actualCashCollected: actual,
        overShortAmount: overShort,
        settledById: user.id,
        settlementDate,
        notes: notes ?? null,
      },
    });

    await tx.lotteryPack.update({
      where: { id: pack.id },
      data: {
        status: "settled",
        settledAt: new Date(),
      },
    });

    return settlement;
  });

  await recordLotterySettlement(storeId, expected, actual, overShort);

  const absOver = Number(overShort.abs());
  if (absOver > 20) {
    const recipients = await getManagerAdminUserIdsForStore(storeId);
    const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });
    for (const uid of recipients) {
      const prefs = await getOrCreateNotificationPreferences(uid);
      if (!categoryAllowedByPreference(prefs, "lottery")) continue;
      const dk = `lottery_os_crit:${result.id}:${uid}`;
      const exists = await prisma.notification.findFirst({ where: { recipientUserId: uid, dedupeKey: dk } });
      if (exists) continue;
      await prisma.notification.create({
        data: {
          storeId,
          recipientUserId: uid,
          title: `Lottery settlement variance — ${store?.name ?? storeId}`,
          description: `Pack ${pack.packNumber} (${pack.gameName}): over/short $${Number(overShort).toFixed(2)} exceeds $20.`,
          severity: "critical",
          category: "lottery",
          linkUrl: `/store/${encodeURIComponent(storeId)}/lottery`,
          dedupeKey: dk,
        },
      });
    }
  }

  const warnHighlight = absOver > 5;

  return NextResponse.json({
    ok: true,
    settlement: {
      id: result.id,
      gameName: result.gameName,
      ticketsSoldCount: result.ticketsSoldCount,
      ticketsRemainingCount: result.ticketsRemainingCount,
      expectedRevenue: result.expectedRevenue.toString(),
      actualCashCollected: result.actualCashCollected.toString(),
      overShortAmount: result.overShortAmount.toString(),
      warnLargeDiscrepancy: warnHighlight,
    },
  });
}
