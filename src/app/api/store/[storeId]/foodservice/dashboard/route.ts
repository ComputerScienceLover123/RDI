import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canManageProductionPlan, canViewFoodservice } from "@/lib/store/foodserviceAccess";
import { menuItemsVisibleWhere } from "@/lib/foodservice/menuFilter";
import { addDaysLocal, avgSoldSameWeekday, soldUnitsByMenuItemOnDate } from "@/lib/foodservice/stats";
import { endOfLocalDay, startOfLocalDay } from "@/lib/sales/dates";

export const runtime = "nodejs";

function urgency(
  remainingMs: number,
  holdMs: number,
  status: string,
): "green" | "yellow" | "red" | "expired" {
  if (status !== "active") return "green";
  if (remainingMs <= 0) return "expired";
  if (remainingMs <= 10 * 60 * 1000) return "red";
  if (remainingMs <= holdMs / 2) return "yellow";
  return "green";
}

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canViewFoodservice(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = Date.now();
  const todayStart = startOfLocalDay(new Date());
  const todayEnd = endOfLocalDay(new Date());

  const menuWhere = { storeId, ...menuItemsVisibleWhere(store.hatchEnabled) };

  const [menuItems, hotRows, wasteRows, lastWeekSales] = await Promise.all([
    prisma.foodserviceMenuItem.findMany({
      where: menuWhere,
      orderBy: [{ category: "asc" }, { itemName: "asc" }],
      include: { recipe: { select: { id: true, name: true } } },
    }),
    prisma.foodserviceHotCaseEntry.findMany({
      where: { storeId, status: "active" },
      include: {
        menuItem: {
          select: {
            id: true,
            itemName: true,
            holdTimeMinutes: true,
            retailPrice: true,
            category: true,
            brand: true,
          },
        },
      },
      orderBy: { expiresAt: "asc" },
    }),
    prisma.foodserviceWasteLog.findMany({
      where: { storeId, createdAt: { gte: todayStart, lte: todayEnd } },
      include: { menuItem: { select: { retailPrice: true } } },
    }),
    soldUnitsByMenuItemOnDate(storeId, addDaysLocal(new Date(), -7)),
  ]);

  const hotCase = hotRows.map((h) => {
    const holdMs = h.menuItem.holdTimeMinutes * 60 * 1000;
    const remainingMs = h.expiresAt.getTime() - now;
    return {
      id: h.id,
      menuItemId: h.menuItemId,
      itemName: h.menuItem.itemName,
      holdTimeMinutes: h.menuItem.holdTimeMinutes,
      category: h.menuItem.category,
      brand: h.menuItem.brand,
      quantityPlaced: h.quantityPlaced,
      placedAt: h.placedAt.toISOString(),
      expiresAt: h.expiresAt.toISOString(),
      remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
      urgency: urgency(remainingMs, holdMs, h.status),
      needsDisposition: h.status === "active" && remainingMs <= 0,
    };
  });

  let wasteCount = 0;
  let wasteDollars = 0;
  for (const w of wasteRows) {
    wasteCount += w.quantity;
    wasteDollars += w.quantity * Number(w.menuItem.retailPrice);
  }

  const suggestions = [];
  for (const m of menuItems) {
    const lastWeek = lastWeekSales.get(m.id) ?? 0;
    const avg4 = await avgSoldSameWeekday(storeId, m.id, 4, new Date());
    const suggested = Math.max(1, Math.ceil(Math.max(lastWeek, avg4)));
    suggestions.push({
      menuItemId: m.id,
      itemName: m.itemName,
      category: m.category,
      sameDayLastWeek: lastWeek,
      avgFourWeekSameWeekday: Math.round(avg4 * 10) / 10,
      suggestedPrep: suggested,
    });
  }

  return NextResponse.json({
    storeId,
    hatchEnabled: store.hatchEnabled,
    menuItems: menuItems.map((m) => ({
      id: m.id,
      itemName: m.itemName,
      category: m.category,
      brand: m.brand,
      holdTimeMinutes: m.holdTimeMinutes,
      prepTimeMinutes: m.prepTimeMinutes,
      retailPrice: m.retailPrice.toString(),
      recipeId: m.recipeId,
      recipeName: m.recipe?.name ?? null,
    })),
    hotCase,
    wasteToday: {
      itemCount: wasteCount,
      estimatedDollars: Math.round(wasteDollars * 100) / 100,
    },
    suggestions,
    canManageProduction: canManageProductionPlan(user, storeId),
  });
}
