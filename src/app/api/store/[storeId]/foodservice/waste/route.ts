import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canOperateHotCase, canViewFoodservice } from "@/lib/store/foodserviceAccess";
import { parseLocalYMD } from "@/lib/sales/dates";

export const runtime = "nodejs";

const postBody = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().positive(),
  reason: z.enum(["expired_hold", "dropped", "overproduction", "quality_issue", "other"]),
  notes: z.string().max(2000).optional(),
});

export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canViewFoodservice(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const menuItemId = sp.get("menuItemId")?.trim();
  const reason = sp.get("reason");
  const employeeId = sp.get("employeeId")?.trim();
  const q = sp.get("q")?.trim();

  const where: Prisma.FoodserviceWasteLogWhereInput = { storeId };
  if (from || to) {
    where.createdAt = {};
    if (from) {
      const d = parseLocalYMD(from);
      if (d) where.createdAt.gte = d;
    }
    if (to) {
      const d = parseLocalYMD(to);
      if (d) {
        d.setHours(23, 59, 59, 999);
        where.createdAt.lte = d;
      }
    }
  }
  if (menuItemId) where.menuItemId = menuItemId;
  const reasons = ["expired_hold", "dropped", "overproduction", "quality_issue", "other"] as const;
  if (reason && reasons.includes(reason as (typeof reasons)[number])) {
    where.reason = reason as (typeof reasons)[number];
  }
  if (employeeId) where.loggedById = employeeId;
  if (q) {
    where.OR = [
      { menuItem: { itemName: { contains: q, mode: "insensitive" } } },
      { loggedBy: { firstName: { contains: q, mode: "insensitive" } } },
      { loggedBy: { lastName: { contains: q, mode: "insensitive" } } },
    ];
  }

  const rows = await prisma.foodserviceWasteLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      menuItem: { select: { itemName: true, retailPrice: true } },
      loggedBy: { select: { firstName: true, lastName: true, id: true } },
    },
  });

  return NextResponse.json({
    waste: rows.map((w) => ({
      id: w.id,
      createdAt: w.createdAt.toISOString(),
      menuItemId: w.menuItemId,
      itemName: w.menuItem.itemName,
      quantity: w.quantity,
      reason: w.reason,
      estimatedValue: Math.round(w.quantity * Number(w.menuItem.retailPrice) * 100) / 100,
      loggedByName: `${w.loggedBy.firstName} ${w.loggedBy.lastName}`,
      loggedById: w.loggedBy.id,
    })),
  });
}

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canOperateHotCase(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = postBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const item = await prisma.foodserviceMenuItem.findFirst({
    where: { id: parsed.data.menuItemId, storeId, active: true },
  });
  if (!item) return NextResponse.json({ error: "Menu item not found" }, { status: 404 });

  await prisma.foodserviceWasteLog.create({
    data: {
      storeId,
      menuItemId: item.id,
      quantity: parsed.data.quantity,
      reason: parsed.data.reason,
      loggedById: user.id,
    },
  });

  return NextResponse.json({ ok: true });
}
