import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canManageLottery } from "@/lib/store/lotteryAccess";
import { isAllowedTicketPrice, toTicketPriceDecimal } from "@/lib/lottery/prices";
import { recordLotteryPackActivated } from "@/lib/lottery/dailySummary";

export const runtime = "nodejs";

const bodySchema = z.object({
  packNumber: z.string().min(1),
  gameName: z.string().min(1),
  ticketCountPerPack: z.number().int().positive(),
  ticketPrice: z.number(),
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
  const d = parsed.data;
  if (!isAllowedTicketPrice(d.ticketPrice)) {
    return NextResponse.json({ error: "Ticket price must be one of: 1,2,3,5,10,20,30" }, { status: 400 });
  }

  const existing = await prisma.lotteryPack.findUnique({
    where: { storeId_packNumber: { storeId, packNumber: d.packNumber } },
  });

  const now = new Date();
  if (existing) {
    if (existing.status === "settled" || existing.status === "returned") {
      return NextResponse.json({ error: "Pack already finalized" }, { status: 400 });
    }
    if (existing.status === "activated") {
      return NextResponse.json({ error: "Pack is already activated" }, { status: 400 });
    }
    const updated = await prisma.lotteryPack.update({
      where: { id: existing.id },
      data: {
        gameName: d.gameName,
        ticketCountPerPack: d.ticketCountPerPack,
        ticketPrice: toTicketPriceDecimal(d.ticketPrice),
        status: "activated",
        activatedAt: now,
        activatedById: user.id,
      },
    });
    await recordLotteryPackActivated(storeId);
    return NextResponse.json({
      ok: true,
      pack: {
        id: updated.id,
        gameName: updated.gameName,
        packNumber: updated.packNumber,
        ticketCountPerPack: updated.ticketCountPerPack,
        ticketPrice: updated.ticketPrice.toString(),
        status: updated.status,
        activatedAt: updated.activatedAt?.toISOString(),
      },
    });
  }

  const created = await prisma.lotteryPack.create({
    data: {
      storeId,
      gameName: d.gameName,
      packNumber: d.packNumber,
      ticketCountPerPack: d.ticketCountPerPack,
      ticketPrice: toTicketPriceDecimal(d.ticketPrice),
      status: "activated",
      activatedAt: now,
      activatedById: user.id,
    },
  });
  await recordLotteryPackActivated(storeId);
  return NextResponse.json({
    ok: true,
    pack: {
      id: created.id,
      gameName: created.gameName,
      packNumber: created.packNumber,
      ticketCountPerPack: created.ticketCountPerPack,
      ticketPrice: created.ticketPrice.toString(),
      status: created.status,
      activatedAt: created.activatedAt?.toISOString(),
    },
  });
}
