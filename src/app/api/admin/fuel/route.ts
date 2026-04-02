import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";

export const runtime = "nodejs";

export async function GET() {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.fuelData.findMany({
    include: { store: { select: { id: true, name: true } } },
    orderBy: [{ storeId: "asc" }, { tankNumber: "asc" }],
  });

  const payload = rows.map((t) => {
    const cap = Number(t.tankCapacityGallons);
    const vol = Number(t.currentVolumeGallons);
    const pct = cap > 0 ? (vol / cap) * 100 : 0;
    return {
      id: t.id,
      storeId: t.storeId,
      storeName: t.store.name,
      tankNumber: t.tankNumber,
      grade: t.grade,
      currentVolumeGallons: t.currentVolumeGallons.toString(),
      tankCapacityGallons: t.tankCapacityGallons.toString(),
      currentRetailPricePerGallon: t.currentRetailPricePerGallon.toString(),
      fillPct: Math.round(pct * 10) / 10,
    };
  });

  return NextResponse.json({ tanks: payload });
}
