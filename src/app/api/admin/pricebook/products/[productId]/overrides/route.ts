import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { logProductChange } from "@/lib/pricebook/changeLog";
import { z } from "zod";

export const runtime = "nodejs";

const PostSchema = z.object({
  storeId: z.string().min(1),
  retailPrice: z.union([z.string(), z.number()]),
});

export async function POST(req: NextRequest, { params }: { params: { productId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const price = new Prisma.Decimal(String(parsed.data.retailPrice));
  const { storeId } = parsed.data;

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const product = await prisma.product.findUnique({ where: { id: params.productId } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const existing = await prisma.storeProductPriceOverride.findUnique({
    where: { storeId_productId: { storeId, productId: params.productId } },
  });

  await prisma.$transaction(async (tx) => {
    await tx.storeProductPriceOverride.upsert({
      where: { storeId_productId: { storeId, productId: params.productId } },
      create: {
        storeId,
        productId: params.productId,
        retailPrice: price,
      },
      update: { retailPrice: price },
    });

    await logProductChange(tx, {
      productId: params.productId,
      changedById: auth.user.id,
      fieldKey: `overrideRetail:${storeId}`,
      oldValue: existing ? existing.retailPrice.toString() : product.retailPrice.toString(),
      newValue: price.toString(),
    });
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { productId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const storeId = req.nextUrl.searchParams.get("storeId");
  if (!storeId) return NextResponse.json({ error: "storeId required" }, { status: 400 });

  const existing = await prisma.storeProductPriceOverride.findUnique({
    where: { storeId_productId: { storeId, productId: params.productId } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const product = await prisma.product.findUnique({ where: { id: params.productId } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.storeProductPriceOverride.delete({
      where: { storeId_productId: { storeId, productId: params.productId } },
    });
    await logProductChange(tx, {
      productId: params.productId,
      changedById: auth.user.id,
      fieldKey: `overrideRetail:${storeId}:removed`,
      oldValue: existing.retailPrice.toString(),
      newValue: product.retailPrice.toString(),
    });
  });

  return NextResponse.json({ ok: true });
}
