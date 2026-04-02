import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canChangeFuelPrice, canLogFuelDelivery, canViewFuel } from "@/lib/store/fuelAccess";
import { recordTodaySnapshotsForStore } from "@/lib/fuel/snapshots";
import { buildStoreFuelSalesTrend } from "@/lib/fuel/salesTrend";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canViewFuel(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await recordTodaySnapshotsForStore(storeId);

  const [tanks, deliveries, trend] = await Promise.all([
    prisma.fuelData.findMany({
      where: { storeId },
      orderBy: { tankNumber: "asc" },
    }),
    prisma.fuelDelivery.findMany({
      where: { storeId },
      orderBy: [{ deliveryDate: "desc" }, { createdAt: "desc" }],
      take: 150,
      include: {
        loggedBy: { select: { firstName: true, lastName: true, id: true } },
        tank: { select: { tankNumber: true, grade: true } },
      },
    }),
    buildStoreFuelSalesTrend(storeId, 14),
  ]);

  const priceHistoryByTank: Record<
    string,
    Array<{
      id: string;
      createdAt: string;
      oldPricePerGallon: string;
      newPricePerGallon: string;
      changedByName: string;
    }>
  > = {};
  if (tanks.length > 0) {
    const histories = await Promise.all(
      tanks.map((t) =>
        prisma.fuelPriceHistory.findMany({
          where: { fuelDataId: t.id },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { changedBy: { select: { firstName: true, lastName: true } } },
        }),
      ),
    );
    tanks.forEach((t, i) => {
      priceHistoryByTank[t.id] = histories[i]!.map((h) => ({
        id: h.id,
        createdAt: h.createdAt.toISOString(),
        oldPricePerGallon: h.oldPricePerGallon.toString(),
        newPricePerGallon: h.newPricePerGallon.toString(),
        changedByName: `${h.changedBy.firstName} ${h.changedBy.lastName}`,
      }));
    });
  }

  const tankPayload = tanks.map((t) => {
    const cap = Number(t.tankCapacityGallons);
    const vol = Number(t.currentVolumeGallons);
    const pct = cap > 0 ? (vol / cap) * 100 : 0;
    return {
      id: t.id,
      tankNumber: t.tankNumber,
      grade: t.grade,
      currentVolumeGallons: t.currentVolumeGallons.toString(),
      tankCapacityGallons: t.tankCapacityGallons.toString(),
      currentRetailPricePerGallon: t.currentRetailPricePerGallon.toString(),
      fillPct: Math.round(pct * 10) / 10,
    };
  });

  return NextResponse.json({
    storeId,
    storeName: store.name,
    tanks: tankPayload,
    deliveries: deliveries.map((d) => ({
      id: d.id,
      deliveryDate: d.deliveryDate.toISOString().slice(0, 10),
      volumeGallons: d.volumeGallons.toString(),
      notes: d.notes,
      tankNumber: d.tank.tankNumber,
      grade: d.tank.grade,
      loggedByName: `${d.loggedBy.firstName} ${d.loggedBy.lastName}`,
      loggedById: d.loggedBy.id,
      createdAt: d.createdAt.toISOString(),
    })),
    salesTrend14d: trend,
    priceHistoryByTank,
    canLogDelivery: canLogFuelDelivery(user, storeId),
    canChangePrice: canChangeFuelPrice(user, storeId),
  });
}
