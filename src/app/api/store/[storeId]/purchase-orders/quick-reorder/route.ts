import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canManagePurchaseOrders, canViewPurchaseOrders } from "@/lib/store/purchaseOrderAccess";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

/** Create one draft PO per vendor for all low-stock products at this store. */
export async function POST(_req: Request, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!canManagePurchaseOrders(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const storeId = params.storeId;
  if (!canViewPurchaseOrders(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const invRows = await prisma.inventory.findMany({
    where: { storeId },
    include: { product: true },
  });

  const low = invRows.filter((r) => r.quantityOnHand <= r.minStockThreshold);
  if (low.length === 0) {
    return NextResponse.json({ ok: true, created: [], message: "No low-stock products" });
  }

  const byVendor = new Map<string, typeof low>();
  for (const row of low) {
    const vid = row.product.vendorId;
    if (!byVendor.has(vid)) byVendor.set(vid, []);
    byVendor.get(vid)!.push(row);
  }

  const now = new Date();
  const createdIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const [, rows] of byVendor) {
      const vendorId = rows[0]!.product.vendorId;
      let total = new Prisma.Decimal(0);
      const lineCreates = rows.map((r) => {
        const qty = Math.max(0, r.minStockThreshold - r.quantityOnHand);
        const unit = r.product.costPrice;
        total = total.add(unit.mul(qty));
        return {
          productId: r.productId,
          quantityOrdered: Math.max(1, qty),
          quantityReceived: 0,
          unitCost: unit,
        };
      });

      const po = await tx.purchaseOrder.create({
        data: {
          storeId,
          vendorId,
          status: "draft",
          orderedByEmployeeId: user.id,
          dateOrdered: now,
          totalCost: total,
          notes: "Quick reorder (draft) — review and submit",
          lineItems: { create: lineCreates },
        },
        select: { id: true },
      });
      createdIds.push(po.id);
    }
  });

  return NextResponse.json({ ok: true, createdIds });
}
