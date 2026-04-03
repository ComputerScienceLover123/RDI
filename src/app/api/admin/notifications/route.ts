import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import type { NotificationCategory, NotificationSeverity, Prisma } from "@prisma/client";

export const runtime = "nodejs";

const PAGE = 40;

export async function GET(req: NextRequest) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const storeId = sp.get("storeId");
  const severity = sp.get("severity") as NotificationSeverity | null;
  const category = sp.get("category") as NotificationCategory | null;
  const from = sp.get("from");
  const to = sp.get("to");
  const page = Math.max(1, Number(sp.get("page") || "1") || 1);

  const where: Prisma.NotificationWhereInput = {};

  if (storeId && storeId !== "all") {
    where.storeId = storeId;
  }
  if (severity && ["info", "warning", "critical"].includes(severity)) {
    where.severity = severity;
  }
  if (
    category &&
    ["low_stock", "void_alert", "delivery", "audit", "shrinkage", "system", "cash"].includes(category)
  ) {
    where.category = category;
  }
  const createdAt: Prisma.DateTimeFilter = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) createdAt.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) {
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
  }
  if (Object.keys(createdAt).length > 0) {
    where.createdAt = createdAt;
  }

  const [total, rows, stores] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: {
        recipient: { select: { email: true, firstName: true, lastName: true, role: true } },
        store: { select: { id: true, name: true } },
      },
    }),
    prisma.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return NextResponse.json({
    total,
    page,
    pageSize: PAGE,
    totalPages: Math.ceil(total / PAGE),
    stores,
    notifications: rows.map((n) => ({
      id: n.id,
      storeId: n.storeId,
      storeName: n.store?.name ?? null,
      recipientEmail: n.recipient.email,
      recipientName: `${n.recipient.firstName} ${n.recipient.lastName}`.trim(),
      recipientRole: n.recipient.role,
      title: n.title,
      description: n.description,
      severity: n.severity,
      category: n.category,
      linkUrl: n.linkUrl,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}
