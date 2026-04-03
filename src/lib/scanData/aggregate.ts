import { Prisma, type ScanDataRebateType, type TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type QualifyingStoreProductAgg = {
  storeId: string;
  productId: string;
  upc: string;
  productName: string;
  netUnits: number;
  netRetail: Prisma.Decimal;
};

function signedQtyAndRetail(
  type: TransactionType,
  quantity: number,
  lineTotal: Prisma.Decimal,
): { qty: number; retail: Prisma.Decimal } {
  if (type === "void") return { qty: 0, retail: new Prisma.Decimal(0) };
  if (type === "refund") return { qty: -quantity, retail: lineTotal.neg() };
  return { qty: quantity, retail: lineTotal };
}

/** Net qualifying units and retail $ per store+product for POS lines in range (sales minus refunds; voids excluded). */
export async function aggregateQualifyingSalesByStoreProduct(
  productIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<QualifyingStoreProductAgg[]> {
  if (productIds.length === 0) return [];

  const items = await prisma.transactionLineItem.findMany({
    where: {
      productId: { in: productIds },
      transaction: {
        transactionAt: { gte: rangeStart, lte: rangeEnd },
        type: { in: ["sale", "refund"] },
      },
    },
    include: {
      transaction: { select: { storeId: true, type: true } },
      product: { select: { upc: true, name: true } },
    },
  });

  const map = new Map<string, { storeId: string; productId: string; upc: string; name: string; u: number; r: Prisma.Decimal }>();

  for (const li of items) {
    const { qty, retail } = signedQtyAndRetail(li.transaction.type, li.quantity, li.lineTotal);
    if (qty === 0 && retail.isZero()) continue;
    const key = `${li.transaction.storeId}\t${li.productId}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, {
        storeId: li.transaction.storeId,
        productId: li.productId,
        upc: li.product.upc,
        name: li.product.name,
        u: qty,
        r: retail,
      });
    } else {
      prev.u += qty;
      prev.r = prev.r.add(retail);
    }
  }

  return [...map.values()].map((v) => ({
    storeId: v.storeId,
    productId: v.productId,
    upc: v.upc,
    productName: v.name,
    netUnits: v.u,
    netRetail: v.r,
  }));
}

export function totalRebateForProgram(
  rebateType: ScanDataRebateType,
  rebateValue: Prisma.Decimal,
  totalNetUnits: number,
  totalNetRetail: Prisma.Decimal,
): Prisma.Decimal {
  if (rebateType === "per_unit") {
    return rebateValue.mul(new Prisma.Decimal(totalNetUnits));
  }
  return totalNetRetail.mul(rebateValue).div(new Prisma.Decimal(100));
}

/** Aggregate totals across all store-product rows (one program’s enrolled products). */
export function sumTotals(rows: QualifyingStoreProductAgg[]): { units: number; retail: Prisma.Decimal } {
  let units = 0;
  let retail = new Prisma.Decimal(0);
  for (const r of rows) {
    units += r.netUnits;
    retail = retail.add(r.netRetail);
  }
  return { units, retail };
}
