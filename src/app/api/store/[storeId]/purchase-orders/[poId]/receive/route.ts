import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canManagePurchaseOrders, canViewPurchaseOrders } from "@/lib/store/purchaseOrderAccess";

export const runtime = "nodejs";

type ReceiptLine = { lineItemId: string; quantity: number };

export async function POST(req: NextRequest, { params }: { params: { storeId: string; poId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!canManagePurchaseOrders(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { storeId, poId } = params;
  if (!canViewPurchaseOrders(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { lines?: ReceiptLine[] } | null;
  const lines = body?.lines;
  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "lines required" }, { status: 400 });
  }

  for (const l of lines) {
    if (!l.lineItemId || typeof l.quantity !== "number" || !Number.isFinite(l.quantity)) {
      return NextResponse.json({ error: "Invalid line" }, { status: 400 });
    }
    if (l.quantity < 0) return NextResponse.json({ error: "Quantity cannot be negative" }, { status: 400 });
  }

  const po = await prisma.purchaseOrder.findFirst({
    where: { id: poId, storeId },
    include: { lineItems: true },
  });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (po.status !== "submitted") {
    return NextResponse.json({ error: "Only submitted POs can be received" }, { status: 400 });
  }

  const lineIds = new Set(po.lineItems.map((l) => l.id));
  for (const l of lines) {
    if (!lineIds.has(l.lineItemId)) return NextResponse.json({ error: "Invalid line item" }, { status: 400 });
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const rec of lines) {
      if (rec.quantity === 0) continue;

      const li = po.lineItems.find((x) => x.id === rec.lineItemId)!;

      await tx.inventory.update({
        where: { storeId_productId: { storeId, productId: li.productId } },
        data: { quantityOnHand: { increment: rec.quantity } },
      });

      await tx.purchaseOrderLineItem.update({
        where: { id: li.id },
        data: { quantityReceived: { increment: rec.quantity } },
      });
    }

    const fresh = await tx.purchaseOrderLineItem.findMany({ where: { purchaseOrderId: po.id } });
    const fullyReceived = fresh.every((li) => li.quantityReceived >= li.quantityOrdered);

    if (fullyReceived) {
      await tx.purchaseOrder.update({
        where: { id: po.id },
        data: { status: "received", dateReceived: now },
      });
    }
  });

  const updated = await prisma.purchaseOrder.findFirst({
    where: { id: poId, storeId },
    select: { status: true, dateReceived: true },
  });

  return NextResponse.json({
    ok: true,
    status: updated?.status,
    dateReceived: updated?.dateReceived?.toISOString() ?? null,
  });
}
