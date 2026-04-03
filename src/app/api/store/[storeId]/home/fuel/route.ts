import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAccessStore } from "@/lib/store/storeAccess";
import { canViewManagerHomeData } from "@/lib/store/homeAccess";
import { canViewFuel } from "@/lib/store/fuelAccess";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canAccessStore(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canViewManagerHomeData(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canViewFuel(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tanks = await prisma.fuelData.findMany({
    where: { storeId },
    orderBy: { tankNumber: "asc" },
    select: {
      id: true,
      tankNumber: true,
      grade: true,
      currentVolumeGallons: true,
      tankCapacityGallons: true,
    },
  });

  const payload = tanks.map((t) => {
    const cap = Number(t.tankCapacityGallons);
    const vol = Number(t.currentVolumeGallons);
    const fillPct = cap > 0 ? Math.round((vol / cap) * 1000) / 10 : 0;
    return {
      id: t.id,
      tankNumber: t.tankNumber,
      grade: t.grade,
      fillPct,
      urgent: fillPct < 25,
    };
  });

  return NextResponse.json({ hasFuel: payload.length > 0, tanks: payload });
}
