import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
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
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, upc: true, costPrice: true, retailPrice: true },
  });

  const previews = products.map((p) => {
    const newRetail = computeNewRetail(mode, value, p.costPrice, p.retailPrice);
    return {
      productId: p.id,
      name: p.name,
      upc: p.upc,
      oldRetail: p.retailPrice.toString(),
      newRetail: newRetail.toString(),
    };
  });

  return NextResponse.json({ previews, mode, value });
}
