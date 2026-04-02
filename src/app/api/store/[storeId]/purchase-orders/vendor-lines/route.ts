import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canViewPurchaseOrders } from "@/lib/store/purchaseOrderAccess";

export const runtime = "nodejs";

/** Products from a vendor that have inventory rows at this store (for new PO form). */
export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canViewPurchaseOrders(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const vendorId = req.nextUrl.searchParams.get("vendorId");
  if (!vendorId) return NextResponse.json({ error: "vendorId required" }, { status: 400 });

  const rows = await prisma.inventory.findMany({
    where: { storeId, product: { vendorId } },
    include: { product: { select: { id: true, name: true, upc: true, costPrice: true } } },
    orderBy: { product: { name: "asc" } },
  });

  return NextResponse.json({
    lines: rows.map((r) => {
      const suggested = Math.max(0, r.minStockThreshold - r.quantityOnHand);
      return {
        inventoryId: r.id,
        productId: r.productId,
        productName: r.product.name,
        upc: r.product.upc,
        quantityOnHand: r.quantityOnHand,
        minStockThreshold: r.minStockThreshold,
        suggestedOrderQty: suggested,
        unitCost: r.product.costPrice.toString(),
      };
    }),
  });
}
