import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canViewFoodserviceRecipes } from "@/lib/store/foodserviceAccess";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canViewFoodserviceRecipes(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const recipes = await prisma.recipe.findMany({
    where: {
      active: true,
      OR: store.hatchEnabled ? [{ brand: "store_brand" }, { brand: "hatch" }] : [{ brand: "store_brand" }],
    },
    orderBy: [{ brand: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      brand: true,
      category: true,
      prepTimeMinutes: true,
      cookTimeMinutes: true,
      yieldQuantity: true,
    },
  });

  return NextResponse.json({
    recipes: recipes.map((r) => ({
      ...r,
      yieldQuantity: r.yieldQuantity.toString(),
    })),
  });
}
