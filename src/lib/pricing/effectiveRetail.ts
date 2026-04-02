import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Effective retail for one product at a store (override or master catalog price). */
export async function getEffectiveRetailPrice(storeId: string, productId: string): Promise<Prisma.Decimal> {
  const o = await prisma.storeProductPriceOverride.findUnique({
    where: { storeId_productId: { storeId, productId } },
  });
  if (o) return o.retailPrice;
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { retailPrice: true },
  });
  if (!p) throw new Error("Product not found");
  return p.retailPrice;
}

/** Batch map productId -> effective retail at store. */
export async function getEffectiveRetailMap(
  storeId: string,
  productIds: string[]
): Promise<Map<string, Prisma.Decimal>> {
  const out = new Map<string, Prisma.Decimal>();
  if (productIds.length === 0) return out;

  const [products, overrides] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, retailPrice: true },
    }),
    prisma.storeProductPriceOverride.findMany({
      where: { storeId, productId: { in: productIds } },
    }),
  ]);

  const ov = new Map(overrides.map((x) => [x.productId, x.retailPrice]));
  for (const p of products) {
    out.set(p.id, ov.get(p.id) ?? p.retailPrice);
  }
  return out;
}
