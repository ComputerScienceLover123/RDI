import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAdminFoodservice } from "@/lib/store/foodserviceAccess";

export const runtime = "nodejs";

export async function GET() {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!canAdminFoodservice(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [stores, hatchRecipes, hatchMenuCount] = await Promise.all([
    prisma.store.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, hatchEnabled: true },
    }),
    prisma.recipe.findMany({
      where: { brand: "hatch", active: true },
      select: { id: true, name: true, category: true },
      orderBy: { name: "asc" },
    }),
    prisma.foodserviceMenuItem.count({ where: { brand: "hatch", active: true } }),
  ]);

  return NextResponse.json({
    stores,
    hatchRecipes,
    hatchMenuItemsActive: hatchMenuCount,
  });
}
