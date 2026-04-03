import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canManageProductionPlan } from "@/lib/store/foodserviceAccess";
import { utcNoonFromYmd } from "@/lib/fuel/dates";

export const runtime = "nodejs";

const bodySchema = z.object({
  planDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canManageProductionPlan(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const planDate = utcNoonFromYmd(parsed.data.planDate);

  const plan = await prisma.productionPlan.findUnique({
    where: { storeId_planDate: { storeId, planDate } },
    include: {
      lines: {
        include: {
          menuItem: {
            include: {
              recipe: { include: { ingredients: { include: { product: true } } } },
            },
          },
        },
      },
    },
  });

  if (!plan || plan.status !== "draft") {
    return NextResponse.json({ error: "Plan not found or already confirmed" }, { status: 400 });
  }

  const productNeed = new Map<string, Prisma.Decimal>();
  for (const line of plan.lines) {
    const m = line.menuItem;
    if (!m.recipe) continue;
    const yieldN = Number(m.recipe.yieldQuantity);
    const batches = yieldN > 0 ? Math.ceil(line.quantityFinal / yieldN) : 1;
    const batchesDec = new Prisma.Decimal(batches);
    for (const ing of m.recipe.ingredients) {
      const need = ing.quantityPerBatch.mul(batchesDec);
      const pid = ing.productId;
      productNeed.set(pid, (productNeed.get(pid) ?? new Prisma.Decimal(0)).add(need));
    }
  }

  const shortages: { productId: string; productName: string; need: string; onHand: number }[] = [];
  for (const [productId, need] of productNeed) {
    const inv = await prisma.inventory.findUnique({
      where: { storeId_productId: { storeId, productId } },
      include: { product: { select: { name: true } } },
    });
    const qoh = inv?.quantityOnHand ?? 0;
    if (need.gt(qoh)) {
      shortages.push({
        productId,
        productName: inv?.product.name ?? productId,
        need: need.toFixed(2),
        onHand: qoh,
      });
    }
  }

  await prisma.productionPlan.update({
    where: { id: plan.id },
    data: {
      status: "confirmed",
      confirmedAt: new Date(),
      confirmedById: user.id,
    },
  });

  return NextResponse.json({
    ok: true,
    shortages,
    warning: shortages.length > 0 ? "Some ingredients are short for this plan. Plan is still confirmed." : null,
  });
}
