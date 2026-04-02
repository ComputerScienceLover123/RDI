import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { notificationsWhereForInbox } from "@/lib/alerts/visibility";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const limit = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("limit") || "30") || 30));
  const where = notificationsWhereForInbox(user);

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        storeId: true,
        title: true,
        description: true,
        severity: true,
        category: true,
        linkUrl: true,
        read: true,
        createdAt: true,
      },
    }),
    prisma.notification.count({ where: { ...where, read: false } }),
  ]);

  return NextResponse.json({
    notifications: items.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
  });
}
