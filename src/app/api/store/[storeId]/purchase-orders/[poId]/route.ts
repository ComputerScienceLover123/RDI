import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canManagePurchaseOrders, canViewPurchaseOrders } from "@/lib/store/purchaseOrderAccess";
import { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: { storeId: string; poId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { storeId, poId } = params;
  if (!canViewPurchaseOrders(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const po = await prisma.purchaseOrder.findFirst({
    where: { id: poId, storeId },
    include: {
      vendor: true,
      orderedBy: { select: { firstName: true, lastName: true, email: true } },
      lineItems: { include: { product: { select: { name: true, upc: true } } }, orderBy: { product: { name: "asc" } } },
    },
  });

  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: po.id,
    status: po.status,
    dateOrdered: po.dateOrdered.toISOString(),
    dateReceived: po.dateReceived?.toISOString() ?? null,
    totalCost: po.totalCost.toString(),
    notes: po.notes,
    vendor: { id: po.vendor.id, companyName: po.vendor.companyName },
    orderedBy: `${po.orderedBy.firstName} ${po.orderedBy.lastName}`,
    lineItems: po.lineItems.map((li) => ({
      id: li.id,
      productId: li.productId,
      productName: li.product.name,
      upc: li.product.upc,
      quantityOrdered: li.quantityOrdered,
      quantityReceived: li.quantityReceived,
      outstanding: Math.max(0, li.quantityOrdered - li.quantityReceived),
      unitCost: li.unitCost.toString(),
      lineTotal: li.unitCost.mul(li.quantityOrdered).toString(),
    })),
    canManage: canManagePurchaseOrders(user.role),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { storeId: string; poId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!canManagePurchaseOrders(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { storeId, poId } = params;
  if (!canViewPurchaseOrders(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { action?: string; notes?: string } | null;
  const action = body?.action;

  const po = await prisma.purchaseOrder.findFirst({
    where: { id: poId, storeId },
    include: { lineItems: true },
  });
  if (!po) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "submit") {
    if (po.status !== "draft") {
      return NextResponse.json({ error: "Only draft POs can be submitted" }, { status: 400 });
    }
    if (po.lineItems.length === 0) return NextResponse.json({ error: "PO has no lines" }, { status: 400 });

    let total = new Prisma.Decimal(0);
    for (const li of po.lineItems) {
      total = total.add(li.unitCost.mul(li.quantityOrdered));
    }

    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: {
        status: "submitted",
        dateOrdered: new Date(),
        totalCost: total,
        notes: body?.notes !== undefined ? body.notes?.trim() || null : po.notes,
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (body?.notes !== undefined && action === undefined) {
    if (po.status === "received" || po.status === "cancelled") {
      return NextResponse.json({ error: "Cannot edit notes on this PO" }, { status: 400 });
    }
    await prisma.purchaseOrder.update({
      where: { id: po.id },
      data: { notes: body.notes?.trim() || null },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
}
