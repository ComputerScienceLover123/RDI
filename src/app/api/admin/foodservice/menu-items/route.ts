import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAdminFoodservice } from "@/lib/store/foodserviceAccess";

export const runtime = "nodejs";

const postSchema = z.object({
  storeId: z.string().min(1),
  itemName: z.string().min(1),
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
  brand: z.enum(["store_brand", "hatch"]),
  recipeId: z.string().nullable().optional(),
  retailPrice: z.number().positive(),
  holdTimeMinutes: z.number().int().min(1),
  prepTimeMinutes: z.number().int().min(0),
});

export async function POST(req: NextRequest) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!canAdminFoodservice(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const d = parsed.data;
  const store = await prisma.store.findUnique({ where: { id: d.storeId } });
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  if (d.brand === "hatch" && !store.hatchEnabled) {
    return NextResponse.json({ error: "Enable Hatch for this store before adding Hatch menu items" }, { status: 400 });
  }

  if (d.recipeId) {
    const r = await prisma.recipe.findUnique({ where: { id: d.recipeId } });
    if (!r) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const item = await prisma.foodserviceMenuItem.create({
    data: {
      storeId: d.storeId,
      itemName: d.itemName,
      category: d.category,
      brand: d.brand,
      recipeId: d.recipeId ?? null,
      retailPrice: new Prisma.Decimal(d.retailPrice),
      holdTimeMinutes: d.holdTimeMinutes,
      prepTimeMinutes: d.prepTimeMinutes,
    },
  });

  return NextResponse.json({ id: item.id });
}
