import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { logProductChange } from "@/lib/pricebook/changeLog";
import { z } from "zod";

export const runtime = "nodejs";

const PatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    upc: z.string().min(1).optional(),
    brand: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    category: z
      .enum([
        "tobacco",
        "beverages",
        "snacks",
        "candy",
        "grocery",
        "foodservice",
        "lottery",
        "fuel",
        "other",
      ])
      .optional(),
    vendorId: z.string().min(1).optional(),
    costPrice: z.union([z.string(), z.number()]).optional(),
    retailPrice: z.union([z.string(), z.number()]).optional(),
    taxEligible: z.boolean().optional(),
    active: z.boolean().optional(),
    ageRestricted: z.boolean().optional(),
    minimumAge: z.number().int().min(16).max(99).optional(),
  })
  .strict();

export async function GET(_req: NextRequest, { params }: { params: { productId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const product = await prisma.product.findUnique({
    where: { id: params.productId },
    include: { vendor: true },
  });
  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const overrides = await prisma.storeProductPriceOverride.findMany({
    where: { productId: params.productId },
    include: { store: { select: { id: true, name: true } } },
    orderBy: { store: { name: "asc" } },
  });

  const changelog = await prisma.productChangeLog.findMany({
    where: { productId: params.productId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { changedBy: { select: { firstName: true, lastName: true, email: true } } },
  });

  return NextResponse.json({
    product: {
      id: product.id,
      name: product.name,
      upc: product.upc,
      description: product.description,
      category: product.category,
      brand: product.brand,
      vendorId: product.vendorId,
      vendorName: product.vendor.companyName,
      costPrice: product.costPrice.toString(),
      retailPrice: product.retailPrice.toString(),
      taxEligible: product.taxEligible,
      active: product.active,
      ageRestricted: product.ageRestricted,
      minimumAge: product.minimumAge,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    },
    overrides: overrides.map((o) => ({
      storeId: o.storeId,
      storeName: o.store.name,
      retailPrice: o.retailPrice.toString(),
      updatedAt: o.updatedAt.toISOString(),
    })),
    changelog: changelog.map((c) => ({
      id: c.id,
      fieldKey: c.fieldKey,
      oldValue: c.oldValue,
      newValue: c.newValue,
      createdAt: c.createdAt.toISOString(),
      changedBy: `${c.changedBy.firstName} ${c.changedBy.lastName}`.trim(),
      changedByEmail: c.changedBy.email,
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { productId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const existing = await prisma.product.findUnique({ where: { id: params.productId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const log = (fieldKey: string, oldVal: unknown, newVal: unknown) =>
        logProductChange(tx, {
          productId: params.productId,
          changedById: auth.user.id,
          fieldKey,
          oldValue: oldVal,
          newValue: newVal,
        });

      const updates: Prisma.ProductUpdateInput = {};

      if (data.name !== undefined && data.name !== existing.name) {
        updates.name = data.name;
        await log("name", existing.name, data.name);
      }
      if (data.upc !== undefined && data.upc !== existing.upc) {
        const clash = await tx.product.findFirst({ where: { upc: data.upc, NOT: { id: params.productId } } });
        if (clash) throw new Error("UPC in use");
        updates.upc = data.upc;
        await log("upc", existing.upc, data.upc);
      }
      if (data.brand !== undefined && (data.brand ?? null) !== (existing.brand ?? null)) {
        updates.brand = data.brand;
        await log("brand", existing.brand, data.brand);
      }
      if (data.description !== undefined && (data.description ?? null) !== (existing.description ?? null)) {
        updates.description = data.description;
        await log("description", existing.description, data.description);
      }
      if (data.category !== undefined && data.category !== existing.category) {
        updates.category = data.category;
        await log("category", existing.category, data.category);
      }
      if (data.vendorId !== undefined && data.vendorId !== existing.vendorId) {
        const v = await tx.vendor.findFirst({ where: { id: data.vendorId, active: true } });
        if (!v) throw new Error("Vendor not found");
        updates.vendor = { connect: { id: data.vendorId } };
        await log("vendorId", existing.vendorId, data.vendorId);
      }
      if (data.costPrice !== undefined) {
        const next = new Prisma.Decimal(String(data.costPrice));
        if (!next.equals(existing.costPrice)) {
          updates.costPrice = next;
          await log("costPrice", existing.costPrice.toString(), next.toString());
        }
      }
      if (data.retailPrice !== undefined) {
        const next = new Prisma.Decimal(String(data.retailPrice));
        if (!next.equals(existing.retailPrice)) {
          updates.retailPrice = next;
          await log("retailPrice", existing.retailPrice.toString(), next.toString());
        }
      }
      if (data.taxEligible !== undefined && data.taxEligible !== existing.taxEligible) {
        updates.taxEligible = data.taxEligible;
        await log("taxEligible", existing.taxEligible, data.taxEligible);
      }
      if (data.active !== undefined && data.active !== existing.active) {
        updates.active = data.active;
        await log("active", existing.active, data.active);
      }
      if (data.ageRestricted !== undefined && data.ageRestricted !== existing.ageRestricted) {
        updates.ageRestricted = data.ageRestricted;
        await log("ageRestricted", existing.ageRestricted, data.ageRestricted);
      }
      if (data.minimumAge !== undefined && data.minimumAge !== existing.minimumAge) {
        updates.minimumAge = data.minimumAge;
        await log("minimumAge", existing.minimumAge, data.minimumAge);
      }

      if (Object.keys(updates).length > 0) {
        await tx.product.update({
          where: { id: params.productId },
          data: updates,
        });
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const fresh = await prisma.product.findUnique({
    where: { id: params.productId },
    include: { vendor: true },
  });

  return NextResponse.json({
    product: fresh
      ? {
          id: fresh.id,
          name: fresh.name,
          upc: fresh.upc,
          costPrice: fresh.costPrice.toString(),
          retailPrice: fresh.retailPrice.toString(),
          taxEligible: fresh.taxEligible,
          active: fresh.active,
          ageRestricted: fresh.ageRestricted,
          minimumAge: fresh.minimumAge,
        }
      : null,
  });
}
