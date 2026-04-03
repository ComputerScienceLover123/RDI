import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAdminFoodservice } from "@/lib/store/foodserviceAccess";

export const runtime = "nodejs";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  instructions: z.string().min(1).optional(),
  prepTimeMinutes: z.number().int().min(0).optional(),
  cookTimeMinutes: z.number().int().min(0).optional(),
  cookTemperature: z.string().nullable().optional(),
  yieldQuantity: z.number().positive().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { recipeId: string } },
) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!canAdminFoodservice(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const data: Prisma.RecipeUpdateInput = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.instructions !== undefined) data.instructions = parsed.data.instructions;
  if (parsed.data.prepTimeMinutes !== undefined) data.prepTimeMinutes = parsed.data.prepTimeMinutes;
  if (parsed.data.cookTimeMinutes !== undefined) data.cookTimeMinutes = parsed.data.cookTimeMinutes;
  if (parsed.data.cookTemperature !== undefined) data.cookTemperature = parsed.data.cookTemperature;
  if (parsed.data.yieldQuantity !== undefined) data.yieldQuantity = new Prisma.Decimal(parsed.data.yieldQuantity);
  if (parsed.data.active !== undefined) data.active = parsed.data.active;

  await prisma.recipe.update({ where: { id: params.recipeId }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { recipeId: string } },
) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!canAdminFoodservice(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.recipe.update({ where: { id: params.recipeId }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
