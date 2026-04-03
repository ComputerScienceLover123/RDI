import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canManageLottery, canViewLottery } from "@/lib/store/lotteryAccess";
import { isAllowedTicketPrice, toTicketPriceDecimal } from "@/lib/lottery/prices";

export const runtime = "nodejs";

const createInventoryBody = z.object({
  gameName: z.string().min(1),
  packNumber: z.string().min(1),
  ticketCountPerPack: z.number().int().refine((n) => n === 150 || n === 300 || (n > 0 && n <= 500), "Use 150, 300, or a reasonable count"),
  ticketPrice: z.number(),
});

export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canViewLottery(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status")?.trim();

  const where: Prisma.LotteryPackWhereInput = { storeId };
  if (status === "activated" || status === "inventory" || status === "settled" || status === "returned") {
    where.status = status;
  }

  const orderBy =
    status === "activated" ?
      [{ activatedAt: "asc" as const }]
    : [{ updatedAt: "desc" as const }];

  const packs = await prisma.lotteryPack.findMany({
    where,
    orderBy,
    include: {
      activatedBy: { select: { firstName: true, lastName: true, id: true } },
    },
  });

  const now = Date.now();
  return NextResponse.json({
    packs: packs.map((p) => {
      let daysActive: number | null = null;
      let stale = false;
      if (p.status === "activated" && p.activatedAt) {
        daysActive = Math.floor((now - p.activatedAt.getTime()) / (24 * 60 * 60 * 1000));
        stale = daysActive > 14;
      }
      return {
        id: p.id,
        gameName: p.gameName,
        packNumber: p.packNumber,
        ticketCountPerPack: p.ticketCountPerPack,
        ticketPrice: p.ticketPrice.toString(),
        status: p.status,
        activatedAt: p.activatedAt?.toISOString() ?? null,
        settledAt: p.settledAt?.toISOString() ?? null,
        activatedByName: p.activatedBy ? `${p.activatedBy.firstName} ${p.activatedBy.lastName}` : null,
        daysActive,
        stale,
      };
    }),
  });
}

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canManageLottery(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = createInventoryBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const d = parsed.data;
  if (!isAllowedTicketPrice(d.ticketPrice)) {
    return NextResponse.json({ error: "Ticket price must be one of: 1,2,3,5,10,20,30" }, { status: 400 });
  }

  const pack = await prisma.lotteryPack.create({
    data: {
      storeId,
      gameName: d.gameName,
      packNumber: d.packNumber,
      ticketCountPerPack: d.ticketCountPerPack,
      ticketPrice: toTicketPriceDecimal(d.ticketPrice),
      status: "inventory",
    },
  });

  return NextResponse.json({
    id: pack.id,
    gameName: pack.gameName,
    packNumber: pack.packNumber,
    ticketCountPerPack: pack.ticketCountPerPack,
    ticketPrice: pack.ticketPrice.toString(),
    status: pack.status,
  });
}
