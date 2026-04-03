import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAccessStore } from "@/lib/store/storeAccess";
import { canViewManagerHomeData } from "@/lib/store/homeAccess";

export const runtime = "nodejs";

type FeedItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  actorName: string;
  at: string;
  linkUrl: string;
};

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canAccessStore(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canViewManagerHomeData(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const base = `/store/${encodeURIComponent(storeId)}`;

  const [txns, deliveries, audits, priceHist, waste, posReceived, shifts] = await Promise.all([
    prisma.posTransaction.findMany({
      where: { storeId },
      orderBy: { transactionAt: "desc" },
      take: 6,
      include: { employee: { select: { firstName: true, lastName: true } } },
    }),
    prisma.fuelDelivery.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        loggedBy: { select: { firstName: true, lastName: true } },
        tank: { select: { tankNumber: true, grade: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: { storeId },
      orderBy: { auditedAt: "desc" },
      take: 6,
      include: {
        employee: { select: { firstName: true, lastName: true } },
        product: { select: { name: true } },
      },
    }),
    prisma.fuelPriceHistory.findMany({
      where: { tank: { storeId } },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        changedBy: { select: { firstName: true, lastName: true } },
        tank: { select: { tankNumber: true, grade: true } },
      },
    }),
    prisma.foodserviceWasteLog.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        loggedBy: { select: { firstName: true, lastName: true } },
        menuItem: { select: { itemName: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { storeId, dateReceived: { not: null } },
      orderBy: { dateReceived: "desc" },
      take: 6,
      include: {
        orderedBy: { select: { firstName: true, lastName: true } },
        vendor: { select: { companyName: true } },
      },
    }),
    prisma.shift.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        employee: { select: { firstName: true, lastName: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const items: FeedItem[] = [];

  for (const t of txns) {
    const actor = `${t.employee.firstName} ${t.employee.lastName}`;
    items.push({
      id: `txn-${t.id}`,
      kind: "transaction",
      title: `${t.type} transaction`,
      detail: `Total $${Number(t.total).toFixed(2)}`,
      actorName: actor,
      at: t.transactionAt.toISOString(),
      linkUrl: `${base}/sales`,
    });
  }
  for (const d of deliveries) {
    items.push({
      id: `fueldel-${d.id}`,
      kind: "fuel_delivery",
      title: "Fuel delivery logged",
      detail: `${Number(d.volumeGallons).toLocaleString()} gal · Tank ${d.tank.tankNumber} (${d.tank.grade})`,
      actorName: `${d.loggedBy.firstName} ${d.loggedBy.lastName}`,
      at: d.createdAt.toISOString(),
      linkUrl: `${base}/fuel`,
    });
  }
  for (const a of audits) {
    items.push({
      id: `audit-${a.id}`,
      kind: "audit",
      title: "Inventory audit",
      detail: `${a.product.name} · variance ${a.discrepancyAmount}`,
      actorName: `${a.employee.firstName} ${a.employee.lastName}`,
      at: a.auditedAt.toISOString(),
      linkUrl: `${base}?tab=inventory`,
    });
  }
  for (const p of priceHist) {
    items.push({
      id: `fuelprice-${p.id}`,
      kind: "fuel_price",
      title: "Fuel retail price change",
      detail: `Tank ${p.tank.tankNumber}: $${p.oldPricePerGallon} → $${p.newPricePerGallon}/gal`,
      actorName: `${p.changedBy.firstName} ${p.changedBy.lastName}`,
      at: p.createdAt.toISOString(),
      linkUrl: `${base}/fuel`,
    });
  }
  for (const w of waste) {
    items.push({
      id: `waste-${w.id}`,
      kind: "waste",
      title: "Foodservice waste logged",
      detail: `${w.quantity}× ${w.menuItem.itemName} (${w.reason})`,
      actorName: `${w.loggedBy.firstName} ${w.loggedBy.lastName}`,
      at: w.createdAt.toISOString(),
      linkUrl: `${base}/foodservice`,
    });
  }
  for (const po of posReceived) {
    const dr = po.dateReceived!;
    items.push({
      id: `po-${po.id}`,
      kind: "po_received",
      title: "Purchase order received",
      detail: po.vendor.companyName,
      actorName: `${po.orderedBy.firstName} ${po.orderedBy.lastName}`,
      at: dr.toISOString(),
      linkUrl: `${base}/ordering`,
    });
  }
  for (const s of shifts) {
    items.push({
      id: `shift-${s.id}`,
      kind: "shift",
      title: "Shift scheduled",
      detail: `${s.employee.firstName} ${s.employee.lastName}`,
      actorName: `${s.createdBy.firstName} ${s.createdBy.lastName}`,
      at: s.createdAt.toISOString(),
      linkUrl: `${base}/schedule`,
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const feed = items.slice(0, 15);

  return NextResponse.json({ feed });
}
