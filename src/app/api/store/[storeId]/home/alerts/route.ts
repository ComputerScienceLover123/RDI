import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAccessStore } from "@/lib/store/storeAccess";
import { canViewManagerHomeData } from "@/lib/store/homeAccess";
import { endOfLocalDay, startOfLocalDay } from "@/lib/sales/dates";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canAccessStore(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canViewManagerHomeData(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const start = startOfLocalDay(new Date());
  const end = endOfLocalDay(new Date());

  const alerts = await prisma.notification.findMany({
    where: {
      recipientUserId: user.id,
      storeId,
      severity: { in: ["warning", "critical"] },
      createdAt: { gte: start, lte: end },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      description: true,
      severity: true,
      linkUrl: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    alerts: alerts.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}
