import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canChangeFuelPrice } from "@/lib/store/fuelAccess";
import { recordTodaySnapshotsForStore } from "@/lib/fuel/snapshots";

export const runtime = "nodejs";

const bodySchema = z.object({
  pricePerGallon: z.number().positive().finite(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { storeId: string; fuelDataId: string } },
) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { storeId, fuelDataId } = params;
  if (!canChangeFuelPrice(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const tank = await prisma.fuelData.findFirst({ where: { id: fuelDataId, storeId } });
  if (!tank) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const oldP = tank.currentRetailPricePerGallon;
  const newP = new Prisma.Decimal(parsed.data.pricePerGallon.toFixed(3));
  if (oldP.eq(newP)) {
    return NextResponse.json({
      ok: true,
      currentRetailPricePerGallon: oldP.toString(),
      unchanged: true,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.fuelPriceHistory.create({
      data: {
        fuelDataId: tank.id,
        oldPricePerGallon: oldP,
        newPricePerGallon: newP,
        changedById: user.id,
      },
    });
    await tx.fuelData.update({
      where: { id: tank.id },
      data: { currentRetailPricePerGallon: newP },
    });
  });

  await recordTodaySnapshotsForStore(storeId);

  return NextResponse.json({
    ok: true,
    currentRetailPricePerGallon: newP.toString(),
    previousPricePerGallon: oldP.toString(),
  });
}
