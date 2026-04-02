import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { logProductChange } from "@/lib/pricebook/changeLog";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  productIds: z.array(z.string()).min(1),
  mode: z.enum(["setRetail", "markupPct", "adjustRetailPct"]),
  value: z.number(),
});

function computeNewRetail(
  mode: "setRetail" | "markupPct" | "adjustRetailPct",
  value: number,
  cost: Prisma.Decimal,
  retail: Prisma.Decimal
): Prisma.Decimal {
  if (mode === "setRetail") return new Prisma.Decimal(Number(value).toFixed(2));
  if (mode === "markupPct") {
    const x = cost.mul(new Prisma.Decimal(1 + value / 100));
    return new Prisma.Decimal(x.toFixed(2));
  }
  const x = retail.mul(new Prisma.Decimal(1 + value / 100));
  return new Prisma.Decimal(x.toFixed(2));
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { productIds, mode, value } = parsed.data;

  let updated = 0;
  await prisma.$transaction(async (tx) => {
    for (const id of productIds) {
      const p = await tx.product.findUnique({ where: { id } });
      if (!p) continue;
      const next = computeNewRetail(mode, value, p.costPrice, p.retailPrice);
      if (next.equals(p.retailPrice)) continue;
      await tx.product.update({
        where: { id },
        data: { retailPrice: next },
      });
      await logProductChange(tx, {
        productId: id,
        changedById: auth.user.id,
        fieldKey: `retailPrice(bulk:${mode})`,
        oldValue: p.retailPrice.toString(),
        newValue: next.toString(),
      });
      updated++;
    }
  });

  return NextResponse.json({ ok: true, updated });
}
