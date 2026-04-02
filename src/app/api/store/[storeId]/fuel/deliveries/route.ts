import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canLogFuelDelivery } from "@/lib/store/fuelAccess";
import { formatLocalYMD } from "@/lib/sales/dates";
import { utcNoonFromYmd } from "@/lib/fuel/dates";
import { recordTodaySnapshotsForStore } from "@/lib/fuel/snapshots";

export const runtime = "nodejs";

const bodySchema = z.object({
  fuelDataId: z.string().min(1),
  volumeGallons: z.number().positive().finite(),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canLogFuelDelivery(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const tank = await prisma.fuelData.findFirst({
    where: { id: parsed.data.fuelDataId, storeId },
  });
  if (!tank) return NextResponse.json({ error: "Tank not found" }, { status: 404 });

  const ymd = parsed.data.deliveryDate?.trim() || formatLocalYMD(new Date());
  const deliveryDate = utcNoonFromYmd(ymd);
  const addVol = new Prisma.Decimal(parsed.data.volumeGallons);
  const before = tank.currentVolumeGallons;
  const after = before.add(addVol);
  const cap = tank.tankCapacityGallons;
  const overCap = after.gt(cap);
  const warning = overCap
    ? `Delivery brings tank ${tank.tankNumber} to ${after.toFixed(3)} gal, above capacity ${cap.toFixed(3)} gal. Saved anyway.`
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.fuelDelivery.create({
      data: {
        storeId,
        fuelDataId: tank.id,
        volumeGallons: addVol,
        deliveryDate,
        notes: parsed.data.notes?.trim() || null,
        loggedById: user.id,
      },
    });
    await tx.fuelData.update({
      where: { id: tank.id },
      data: {
        currentVolumeGallons: after,
        lastDeliveryDate: new Date(),
        lastDeliveryVolumeGallons: addVol,
      },
    });
  });

  await recordTodaySnapshotsForStore(storeId);

  const updated = await prisma.fuelData.findUnique({ where: { id: tank.id } });
  return NextResponse.json({
    ok: true,
    warning,
    tank: updated
      ? {
          id: updated.id,
          currentVolumeGallons: updated.currentVolumeGallons.toString(),
          tankCapacityGallons: updated.tankCapacityGallons.toString(),
          fillPct:
            Number(updated.tankCapacityGallons) > 0
              ? Math.round(
                  (Number(updated.currentVolumeGallons) / Number(updated.tankCapacityGallons)) * 1000,
                ) / 10
              : 0,
        }
      : null,
  });
}
