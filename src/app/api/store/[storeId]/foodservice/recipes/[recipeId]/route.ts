import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canViewFoodserviceRecipes } from "@/lib/store/foodserviceAccess";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { storeId: string; recipeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { storeId, recipeId } = params;
  if (!canViewFoodserviceRecipes(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const recipe = await prisma.recipe.findFirst({
    where: {
      id: recipeId,
      active: true,
      OR: store.hatchEnabled ? [{ brand: "store_brand" }, { brand: "hatch" }] : [{ brand: "store_brand" }],
    },
    include: {
      ingredients: {
        include: { product: { select: { id: true, name: true, upc: true } } },
      },
    },
  });
  if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const inv = await prisma.inventory.findMany({
    where: { storeId, productId: { in: recipe.ingredients.map((i) => i.productId) } },
    include: { product: { select: { name: true } } },
  });
  const invMap = new Map(inv.map((i) => [i.productId, i]));

  const ingredients = recipe.ingredients.map((ing) => {
    const row = invMap.get(ing.productId);
    const qoh = row?.quantityOnHand ?? 0;
    const min = row?.minStockThreshold ?? 0;
    const need = Number(ing.quantityPerBatch);
    const ok = qoh >= need;
    const low = qoh <= min || qoh < need;
    return {
      productId: ing.productId,
      productName: ing.product.name,
      quantityPerBatch: ing.quantityPerBatch.toString(),
      unitOfMeasure: ing.unitOfMeasure,
      quantityOnHand: qoh,
      minStockThreshold: min,
      sufficientForBatch: ok,
      lowOrOut: low,
    };
  });

  return NextResponse.json({
    recipe: {
      id: recipe.id,
      name: recipe.name,
      brand: recipe.brand,
      category: recipe.category,
      instructions: recipe.instructions,
      prepTimeMinutes: recipe.prepTimeMinutes,
      cookTimeMinutes: recipe.cookTimeMinutes,
      cookTemperature: recipe.cookTemperature,
      yieldQuantity: recipe.yieldQuantity.toString(),
    },
    ingredients,
  });
}
