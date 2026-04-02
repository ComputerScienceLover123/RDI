import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canManagePurchaseOrders, canViewPurchaseOrders } from "@/lib/store/purchaseOrderAccess";
import { Prisma, type PurchaseOrderStatus } from "@prisma/client";

export const runtime = "nodejs";

const LIST_SORT = new Set(["dateOrdered", "vendor", "status"]);

export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canViewPurchaseOrders(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const sortBy = sp.get("sortBy") ?? "dateOrdered";
  const sortOrder = sp.get("sortOrder") === "asc" ? "asc" : "desc";
  const vendorQ = sp.get("vendor")?.trim();
  const statusFilter = sp.get("status") as PurchaseOrderStatus | null;
  const from = sp.get("from");
  const to = sp.get("to");

  if (!LIST_SORT.has(sortBy)) return NextResponse.json({ error: "Invalid sortBy" }, { status: 400 });

  const where: Prisma.PurchaseOrderWhereInput = { storeId };
  if (vendorQ) {
    where.vendor = { companyName: { contains: vendorQ, mode: "insensitive" } };
  }
  if (statusFilter && ["draft", "submitted", "received", "cancelled"].includes(statusFilter)) {
    where.status = statusFilter;
  }
  if (from || to) {
    where.dateOrdered = {};
    if (from) where.dateOrdered.gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      where.dateOrdered.lte = end;
    }
  }

  const orderBy: Prisma.PurchaseOrderOrderByWithRelationInput =
    sortBy === "vendor"
      ? { vendor: { companyName: sortOrder } }
      : sortBy === "status"
        ? { status: sortOrder }
        : { dateOrdered: sortOrder };

  const pos = await prisma.purchaseOrder.findMany({
    where,
    orderBy,
    include: {
      vendor: { select: { id: true, companyName: true } },
      orderedBy: { select: { firstName: true, lastName: true, email: true } },
      lineItems: { select: { id: true } },
    },
  });

  return NextResponse.json({
    purchaseOrders: pos.map((p) => ({
      id: p.id,
      status: p.status,
      dateOrdered: p.dateOrdered.toISOString(),
      dateReceived: p.dateReceived?.toISOString() ?? null,
      totalCost: p.totalCost.toString(),
      notes: p.notes,
      vendor: p.vendor,
      lineCount: p.lineItems.length,
      orderedBy: `${p.orderedBy.firstName} ${p.orderedBy.lastName}`,
    })),
  });
}

type CreateBody = {
  vendorId: string;
  notes?: string | null;
  lines: Array<{ productId: string; quantityOrdered: number }>;
  status: "draft" | "submitted";
};

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!canManagePurchaseOrders(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const storeId = params.storeId;
  if (!canViewPurchaseOrders(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as CreateBody | null;
  if (!body?.vendorId || !Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: "vendorId and lines required" }, { status: 400 });
  }
  if (body.status !== "draft" && body.status !== "submitted") {
    return NextResponse.json({ error: "status must be draft or submitted" }, { status: 400 });
  }

  for (const l of body.lines) {
    if (!l.productId || typeof l.quantityOrdered !== "number" || !Number.isFinite(l.quantityOrdered)) {
      return NextResponse.json({ error: "Invalid line" }, { status: 400 });
    }
    if (l.quantityOrdered < 1) return NextResponse.json({ error: "Quantity must be at least 1" }, { status: 400 });
  }

  const vendor = await prisma.vendor.findFirst({ where: { id: body.vendorId, active: true } });
  if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 404 });

  const productIds = [...new Set(body.lines.map((l) => l.productId))];
  const inventories = await prisma.inventory.findMany({
    where: { storeId, productId: { in: productIds } },
    include: { product: true },
  });
  if (inventories.length !== productIds.length) {
    return NextResponse.json({ error: "All products must be stocked at this store" }, { status: 400 });
  }
  for (const inv of inventories) {
    if (inv.product.vendorId !== body.vendorId) {
      return NextResponse.json({ error: "All products must belong to the selected vendor" }, { status: 400 });
    }
    if (!inv.product.active) {
      return NextResponse.json({ error: "Inactive products cannot be ordered" }, { status: 400 });
    }
  }

  const now = new Date();
  let total = new Prisma.Decimal(0);
  const lineCreates = body.lines.map((l) => {
    const inv = inventories.find((i) => i.productId === l.productId)!;
    const unit = inv.product.costPrice;
    total = total.add(unit.mul(l.quantityOrdered));
    return {
      productId: l.productId,
      quantityOrdered: l.quantityOrdered,
      quantityReceived: 0,
      unitCost: unit,
    };
  });

  const po = await prisma.purchaseOrder.create({
    data: {
      storeId,
      vendorId: body.vendorId,
      status: body.status === "submitted" ? "submitted" : "draft",
      orderedByEmployeeId: user.id,
      dateOrdered: now,
      totalCost: total,
      notes: body.notes?.trim() || null,
      lineItems: { create: lineCreates },
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: po.id });
}
