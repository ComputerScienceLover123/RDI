import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAccessStore } from "@/lib/store/storeAccess";
import { getEffectiveRetailPrice } from "@/lib/pricing/effectiveRetail";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { storeId: string; productId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { storeId, productId } = params;
  if (!canAccessStore(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const inv = await prisma.inventory.findUnique({
    where: {
      storeId_productId: { storeId, productId },
    },
    include: {
      product: { include: { vendor: true } },
    },
  });

  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [lineItemsRaw, poLinesRaw, lastAudit] = await Promise.all([
    prisma.transactionLineItem.findMany({
      where: {
        productId,
        transaction: { storeId },
      },
      include: {
        transaction: {
          select: {
            id: true,
            transactionAt: true,
            type: true,
            terminalId: true,
            verifoneReferenceId: true,
            paymentMethod: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        },
      },
    }),
    prisma.purchaseOrderLineItem.findMany({
      where: {
        productId,
        purchaseOrder: { storeId },
      },
      include: {
        purchaseOrder: {
          select: {
            id: true,
            status: true,
            dateOrdered: true,
            dateReceived: true,
            totalCost: true,
            vendor: { select: { companyName: true } },
          },
        },
      },
    }),
    prisma.auditLog.findFirst({
      where: { storeId, productId },
      orderBy: { auditedAt: "desc" },
      include: { employee: { select: { firstName: true, lastName: true, email: true } } },
    }),
  ]);

  const effectiveRetail = await getEffectiveRetailPrice(storeId, productId);
  const masterRetail = inv.product.retailPrice;
  const priceOverridden = effectiveRetail.toString() !== masterRetail.toString();

  const lineItems = lineItemsRaw
    .sort((a, b) => b.transaction.transactionAt.getTime() - a.transaction.transactionAt.getTime())
    .slice(0, 25);
  const poLines = poLinesRaw
    .sort((a, b) => b.purchaseOrder.dateOrdered.getTime() - a.purchaseOrder.dateOrdered.getTime())
    .slice(0, 15);

  return NextResponse.json({
    product: {
      id: inv.product.id,
      upc: inv.product.upc,
      name: inv.product.name,
      description: inv.product.description,
      category: inv.product.category,
      brand: inv.product.brand,
      taxEligible: inv.product.taxEligible,
      active: inv.product.active,
      costPrice: inv.product.costPrice.toString(),
      retailPrice: effectiveRetail.toString(),
      masterRetailPrice: priceOverridden ? masterRetail.toString() : undefined,
      priceOverridden,
      vendor: {
        id: inv.product.vendor.id,
        companyName: inv.product.vendor.companyName,
        contactEmail: inv.product.vendor.contactEmail,
        paymentTerms: inv.product.vendor.paymentTerms,
      },
    },
    inventory: {
      quantityOnHand: inv.quantityOnHand,
      minStockThreshold: inv.minStockThreshold,
      lastCountedAt: inv.lastCountedAt?.toISOString() ?? null,
    },
    recentTransactions: lineItems.map((li) => ({
      lineId: li.id,
      quantity: li.quantity,
      unitPrice: li.unitPrice.toString(),
      lineTotal: li.lineTotal.toString(),
      discountAmount: li.discountAmount.toString(),
      transaction: {
        id: li.transaction.id,
        transactionAt: li.transaction.transactionAt.toISOString(),
        type: li.transaction.type,
        terminalId: li.transaction.terminalId,
        verifoneReferenceId: li.transaction.verifoneReferenceId,
        paymentMethod: li.transaction.paymentMethod,
        cashier: `${li.transaction.employee.firstName} ${li.transaction.employee.lastName}`,
      },
    })),
    recentPurchaseOrders: poLines.map((pl) => ({
      lineId: pl.id,
      quantityOrdered: pl.quantityOrdered,
      quantityReceived: pl.quantityReceived,
      unitCost: pl.unitCost.toString(),
      purchaseOrder: {
        id: pl.purchaseOrder.id,
        status: pl.purchaseOrder.status,
        dateOrdered: pl.purchaseOrder.dateOrdered.toISOString(),
        dateReceived: pl.purchaseOrder.dateReceived?.toISOString() ?? null,
        totalCost: pl.purchaseOrder.totalCost.toString(),
        vendorName: pl.purchaseOrder.vendor.companyName,
      },
    })),
    lastAudit: lastAudit
      ? {
          id: lastAudit.id,
          auditedAt: lastAudit.auditedAt.toISOString(),
          systemQuantity: lastAudit.systemQuantity,
          countedQuantity: lastAudit.countedQuantity,
          discrepancyAmount: lastAudit.discrepancyAmount,
          notes: lastAudit.notes,
          employee: `${lastAudit.employee.firstName} ${lastAudit.employee.lastName}`,
        }
      : null,
  });
}
