import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canViewFoodservice } from "@/lib/store/foodserviceAccess";
import { endOfLocalDay, formatLocalYMD, startOfLocalDay } from "@/lib/sales/dates";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canViewFoodservice(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const end = endOfLocalDay(new Date());
  const start = startOfLocalDay(new Date());
  start.setDate(start.getDate() - 29);

  const [wasteRows, soldRows] = await Promise.all([
    prisma.foodserviceWasteLog.findMany({
      where: { storeId, createdAt: { gte: start, lte: end } },
      select: { quantity: true, createdAt: true },
    }),
    prisma.foodserviceHotCaseEntry.findMany({
      where: {
        storeId,
        status: "sold",
        disposedAt: { gte: start, lte: end },
      },
      select: { quantityPlaced: true, disposedAt: true },
    }),
  ]);

  const wasteByDay = new Map<string, number>();
  const soldByDay = new Map<string, number>();

  for (const w of wasteRows) {
    const k = formatLocalYMD(w.createdAt);
    wasteByDay.set(k, (wasteByDay.get(k) ?? 0) + w.quantity);
  }
  for (const s of soldRows) {
    if (!s.disposedAt) continue;
    const k = formatLocalYMD(s.disposedAt);
    soldByDay.set(k, (soldByDay.get(k) ?? 0) + s.quantityPlaced);
  }

  const points: { date: string; wasteUnits: number; soldUnits: number; wastePct: number | null }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const key = formatLocalYMD(d);
    const wu = wasteByDay.get(key) ?? 0;
    const su = soldByDay.get(key) ?? 0;
    const prod = wu + su;
    points.push({
      date: key,
      wasteUnits: wu,
      soldUnits: su,
      wastePct: prod > 0 ? Math.round((wu / prod) * 1000) / 10 : null,
    });
  }

  return NextResponse.json({ points });
}
