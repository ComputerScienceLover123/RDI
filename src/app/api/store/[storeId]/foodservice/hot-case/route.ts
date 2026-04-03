import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canOperateHotCase, canViewFoodservice } from "@/lib/store/foodserviceAccess";
import { menuItemsVisibleWhere } from "@/lib/foodservice/menuFilter";

export const runtime = "nodejs";

const placeBody = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().positive(),
});

export async function GET(_req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canViewFoodservice(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rows = await prisma.foodserviceHotCaseEntry.findMany({
    where: { storeId, status: "active" },
    include: {
      menuItem: { select: { itemName: true, holdTimeMinutes: true, retailPrice: true, category: true, brand: true } },
    },
    orderBy: { expiresAt: "asc" },
  });

  const now = Date.now();
  return NextResponse.json({
    entries: rows.map((h) => {
      const holdMs = h.menuItem.holdTimeMinutes * 60 * 1000;
      const remainingMs = h.expiresAt.getTime() - now;
      let u: "green" | "yellow" | "red" | "expired" = "green";
      if (remainingMs <= 0) u = "expired";
      else if (remainingMs <= 10 * 60 * 1000) u = "red";
      else if (remainingMs <= holdMs / 2) u = "yellow";
      return {
        id: h.id,
        menuItemId: h.menuItemId,
        itemName: h.menuItem.itemName,
        holdTimeMinutes: h.menuItem.holdTimeMinutes,
        quantityPlaced: h.quantityPlaced,
        placedAt: h.placedAt.toISOString(),
        expiresAt: h.expiresAt.toISOString(),
        remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
        urgency: u,
        needsDisposition: remainingMs <= 0,
      };
    }),
  });
}

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canOperateHotCase(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = placeBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const item = await prisma.foodserviceMenuItem.findFirst({
    where: { id: parsed.data.menuItemId, storeId, ...menuItemsVisibleWhere(store.hatchEnabled) },
  });
  if (!item) return NextResponse.json({ error: "Menu item not found" }, { status: 404 });

  const placedAt = new Date();
  const expiresAt = new Date(placedAt.getTime() + item.holdTimeMinutes * 60 * 1000);

  const entry = await prisma.foodserviceHotCaseEntry.create({
    data: {
      storeId,
      menuItemId: item.id,
      quantityPlaced: parsed.data.quantity,
      placedAt,
      expiresAt,
      placedById: user.id,
    },
  });

  return NextResponse.json({
    id: entry.id,
    expiresAt: entry.expiresAt.toISOString(),
  });
}
