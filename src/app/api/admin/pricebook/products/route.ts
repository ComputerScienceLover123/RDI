import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { logProductChange } from "@/lib/pricebook/changeLog";
import { z } from "zod";

export const runtime = "nodejs";

const CreateSchema = z.object({
  name: z.string().min(1),
  upc: z.string().min(1),
  category: z.enum([
    "tobacco",
    "beverages",
    "snacks",
    "candy",
    "grocery",
    "foodservice",
    "lottery",
    "fuel",
    "other",
  ]),
  brand: z.string().optional().nullable(),
  vendorId: z.string().min(1),
  costPrice: z.string().or(z.number()),
  retailPrice: z.string().or(z.number()),
  taxEligible: z.boolean(),
  description: z.string().optional().nullable(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const b = parsed.data;
  const cost = new Prisma.Decimal(String(b.costPrice));
  const retail = new Prisma.Decimal(String(b.retailPrice));

  const vendor = await prisma.vendor.findFirst({ where: { id: b.vendorId, active: true } });
  if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 400 });

  const existing = await prisma.product.findUnique({ where: { upc: b.upc } });
  if (existing) return NextResponse.json({ error: "UPC already exists" }, { status: 409 });

  const stores = await prisma.store.findMany({ select: { id: true } });

  const product = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        name: b.name,
        upc: b.upc,
        category: b.category,
        brand: b.brand ?? null,
        vendorId: b.vendorId,
        costPrice: cost,
        retailPrice: retail,
        taxEligible: b.taxEligible,
        description: b.description ?? null,
        active: true,
      },
    });

    await logProductChange(tx, {
      productId: p.id,
      changedById: auth.user.id,
      fieldKey: "created",
      oldValue: null,
      newValue: p.id,
    });

    for (const s of stores) {
      await tx.inventory.create({
        data: {
          storeId: s.id,
          productId: p.id,
          quantityOnHand: 0,
          minStockThreshold: 5,
        },
      });
    }

    return p;
  });

  return NextResponse.json({ product: { id: product.id, upc: product.upc, name: product.name } });
}
