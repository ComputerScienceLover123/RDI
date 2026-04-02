import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreSalesUser } from "@/lib/sales/salesRoute";
import { decN } from "@/lib/sales/money";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { storeId: string; txnId: string } }) {
  const auth = await requireStoreSalesUser(params.storeId);
  if (!auth.ok) return auth.response;

  if (auth.user.role === "employee") {
    return NextResponse.json({ error: "Transaction detail is not available for your role" }, { status: 403 });
  }

  const txn = await prisma.posTransaction.findFirst({
    where: { id: params.txnId, storeId: params.storeId },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { lineItems: true } },
    },
  });

  if (!txn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const base = {
    id: txn.id,
    transactionAt: txn.transactionAt.toISOString(),
    type: txn.type,
    paymentMethod: txn.paymentMethod,
    subtotal: decN(txn.subtotal),
    taxAmount: decN(txn.taxAmount),
    total: decN(txn.total),
    terminalId: txn.terminalId,
    itemCount: txn._count.lineItems,
    employee: {
      id: txn.employee.id,
      name: `${txn.employee.firstName} ${txn.employee.lastName}`.trim(),
    },
  };

  const lineItems = await prisma.transactionLineItem.findMany({
    where: { transactionId: txn.id },
    include: {
      product: { select: { id: true, name: true, category: true, upc: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    transaction: base,
    lineItems: lineItems.map((li) => ({
      id: li.id,
      productId: li.productId,
      productName: li.product.name,
      category: li.product.category,
      upc: li.product.upc,
      quantity: li.quantity,
      unitPrice: decN(li.unitPrice),
      lineTotal: decN(li.lineTotal),
      discountAmount: decN(li.discountAmount),
    })),
  });
}
