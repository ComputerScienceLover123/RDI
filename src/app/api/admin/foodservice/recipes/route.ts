import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAdminFoodservice } from "@/lib/store/foodserviceAccess";

export const runtime = "nodejs";

const postSchema = z.object({
  name: z.string().min(1),
  brand: z.enum(["store_brand", "hatch"]),
  category: z.enum([
    "roller_grill",
    "pizza",
    "chicken",
    "sides",
    "taquitos",
    "tacos",
    "beverages",
    "other",
  ]),
  instructions: z.string().min(1),
  prepTimeMinutes: z.number().int().min(0),
  cookTimeMinutes: z.number().int().min(0),
  cookTemperature: z.string().optional().nullable(),
  yieldQuantity: z.number().positive(),
  ingredients: z
    .array(
      z.object({
        productId: z.string(),
        quantityPerBatch: z.number().positive(),
        unitOfMeasure: z.string().min(1),
      }),
    )
    .optional(),
});

export async function GET() {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!canAdminFoodservice(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const recipes = await prisma.recipe.findMany({
    orderBy: { name: "asc" },
    include: { ingredients: { include: { product: { select: { name: true } } } } },
  });

  return NextResponse.json({
    recipes: recipes.map((r) => ({
      id: r.id,
      name: r.name,
      brand: r.brand,
      category: r.category,
      active: r.active,
      yieldQuantity: r.yieldQuantity.toString(),
      ingredientCount: r.ingredients.length,
    })),
  });
}

export async function POST(req: NextRequest) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!canAdminFoodservice(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const d = parsed.data;
  const recipe = await prisma.recipe.create({
    data: {
      name: d.name,
      brand: d.brand,
      category: d.category,
      instructions: d.instructions,
      prepTimeMinutes: d.prepTimeMinutes,
      cookTimeMinutes: d.cookTimeMinutes,
      cookTemperature: d.cookTemperature ?? null,
      yieldQuantity: new Prisma.Decimal(d.yieldQuantity),
    },
  });

  if (d.ingredients?.length) {
    await prisma.recipeIngredient.createMany({
      data: d.ingredients.map((ing) => ({
        recipeId: recipe.id,
        productId: ing.productId,
        quantityPerBatch: new Prisma.Decimal(ing.quantityPerBatch),
        unitOfMeasure: ing.unitOfMeasure,
      })),
    });
  }

  return NextResponse.json({ id: recipe.id });
}
