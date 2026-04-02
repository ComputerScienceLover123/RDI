import { prisma } from "@/lib/prisma";
import { endOfLocalDay, formatLocalYMD, startOfLocalDay } from "@/lib/sales/dates";
import type { NotificationCategory, NotificationSeverity } from "@prisma/client";
import { categoryAllowedByPreference, getOrCreateNotificationPreferences } from "./preferences";
import { getManagerAdminUserIdsForStore, getManagerUserIdsForStore } from "./recipients";

function mondayYmd(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return formatLocalYMD(startOfLocalDay(x));
}

export type AlertCheckResult = { created: number; log: string[] };

async function notifyUsers(
  userIds: string[],
  input: {
    storeId: string | null;
    title: string;
    description: string;
    severity: NotificationSeverity;
    category: NotificationCategory;
    linkUrl: string;
    dedupeKeyForUser: (userId: string) => string;
  }
): Promise<number> {
  let created = 0;
  for (const uid of userIds) {
    const prefs = await getOrCreateNotificationPreferences(uid);
    if (!categoryAllowedByPreference(prefs, input.category)) continue;

    const dk = input.dedupeKeyForUser(uid);
    const exists = await prisma.notification.findFirst({
      where: { recipientUserId: uid, dedupeKey: dk },
    });
    if (exists) continue;

    await prisma.notification.create({
      data: {
        storeId: input.storeId,
        recipientUserId: uid,
        title: input.title,
        description: input.description,
        severity: input.severity,
        category: input.category,
        linkUrl: input.linkUrl,
        dedupeKey: dk,
      },
    });
    created++;
  }
  return created;
}

async function checkLowStock(log: string[]): Promise<number> {
  let n = 0;
  const rows = await prisma.inventory.findMany({
    include: { product: { select: { name: true } }, store: { select: { name: true } } },
  });
  const low = rows.filter((r) => r.quantityOnHand <= r.minStockThreshold);
  const today = formatLocalYMD(new Date());

  for (const r of low) {
    const recipients = await getManagerAdminUserIdsForStore(r.storeId);
    if (recipients.length === 0) continue;
    const created = await notifyUsers(recipients, {
      storeId: r.storeId,
      title: `Low stock: ${r.product.name}`,
      description: `Quantity on hand (${r.quantityOnHand}) is at or below the minimum threshold (${r.minStockThreshold}) at ${r.store.name}.`,
      severity: "warning",
      category: "low_stock",
      linkUrl: `/store/${encodeURIComponent(r.storeId)}`,
      dedupeKeyForUser: (uid) => `low_stock:${r.storeId}:${r.productId}:${today}:${uid}`,
    });
    n += created;
  }
  if (n) log.push(`low_stock: ${n} notification(s)`);
  return n;
}

async function checkVoidRefundSpike(log: string[]): Promise<number> {
  let n = 0;
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);
  const todayYmd = formatLocalYMD(now);

  for (const s of stores) {
    const todayCount = await prisma.posTransaction.count({
      where: {
        storeId: s.id,
        type: { in: ["void", "refund"] },
        transactionAt: { gte: todayStart, lte: todayEnd },
      },
    });

    const priorCounts = await Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const day = i + 1;
        const start = new Date(todayStart);
        start.setDate(start.getDate() - day);
        const end = endOfLocalDay(start);
        return prisma.posTransaction.count({
          where: {
            storeId: s.id,
            type: { in: ["void", "refund"] },
            transactionAt: { gte: start, lte: end },
          },
        });
      })
    );
    const avg = priorCounts.reduce((a, b) => a + b, 0) / 7;
    const spike = avg > 0 ? todayCount > avg * 1.5 : todayCount >= 3;

    if (!spike || todayCount === 0) continue;

    const recipients = await getManagerAdminUserIdsForStore(s.id);
    const created = await notifyUsers(recipients, {
      storeId: s.id,
      title: `Void/refund spike at ${s.name}`,
      description: `Today there are ${todayCount} voids/refunds vs a 7-day prior daily average of ${avg.toFixed(2)}.`,
      severity: "critical",
      category: "void_alert",
      linkUrl: `/store/${encodeURIComponent(s.id)}/sales?focus=void_refund`,
      dedupeKeyForUser: (uid) => `void_spike:${s.id}:${todayYmd}:${uid}`,
    });
    n += created;
  }
  if (n) log.push(`void_refund_spike: ${n} notification(s)`);
  return n;
}

async function checkStalePurchaseOrders(log: string[]): Promise<number> {
  let n = 0;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 3);
  cutoff.setHours(0, 0, 0, 0);

  const pos = await prisma.purchaseOrder.findMany({
    where: { status: "submitted", dateOrdered: { lt: cutoff } },
    include: { vendor: { select: { companyName: true } }, store: { select: { name: true } } },
  });

  for (const po of pos) {
    const managers = await getManagerUserIdsForStore(po.storeId);
    const created = await notifyUsers(managers, {
      storeId: po.storeId,
      title: `PO pending: ${po.vendor.companyName}`,
      description: `Purchase order from ${po.vendor.companyName} was submitted more than 3 days ago and is not fully received. Review delivery status.`,
      severity: "info",
      category: "delivery",
      linkUrl: `/store/${encodeURIComponent(po.storeId)}/ordering/${encodeURIComponent(po.id)}`,
      dedupeKeyForUser: (uid) => `po_stale:${po.id}:${uid}`,
    });
    n += created;
  }
  if (n) log.push(`stale_po: ${n} notification(s)`);
  return n;
}

async function checkAuditOverdue(log: string[]): Promise<number> {
  let n = 0;
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  for (const s of stores) {
    const last = await prisma.auditLog.findFirst({
      where: { storeId: s.id },
      orderBy: { auditedAt: "desc" },
      select: { auditedAt: true },
    });

    const overdue = !last || last.auditedAt < thirtyDaysAgo;
    if (!overdue) continue;

    const managers = await getManagerUserIdsForStore(s.id);
    const weekStart = mondayYmd(new Date());
    const created = await notifyUsers(managers, {
      storeId: s.id,
      title: `Inventory audit overdue — ${s.name}`,
      description: last
        ? `No audit log entries in the past 30 days (last audit ${last.auditedAt.toISOString().slice(0, 10)}).`
        : "This store has no audit history. Schedule an inventory audit.",
      severity: "warning",
      category: "audit",
      linkUrl: `/store/${encodeURIComponent(s.id)}`,
      dedupeKeyForUser: (uid) => `audit_overdue:${s.id}:${weekStart}:${uid}`,
    });
    n += created;
  }
  if (n) log.push(`audit_overdue: ${n} notification(s)`);
  return n;
}

async function checkShrinkageRatio(log: string[]): Promise<number> {
  let n = 0;
  const thirtyStart = new Date();
  thirtyStart.setDate(thirtyStart.getDate() - 30);
  thirtyStart.setHours(0, 0, 0, 0);
  const now = new Date();

  const stores = await prisma.store.findMany({ select: { id: true } });

  for (const store of stores) {
    const shrinkByProduct = await prisma.shrinkageRecord.groupBy({
      by: ["productId"],
      where: {
        storeId: store.id,
        periodEnd: { gte: thirtyStart },
        periodStart: { lte: now },
      },
      _sum: { quantityLost: true },
    });

    for (const row of shrinkByProduct) {
      const shrinkQty = row._sum.quantityLost ?? 0;
      if (shrinkQty <= 0) continue;

      const soldAgg = await prisma.transactionLineItem.aggregate({
        _sum: { quantity: true },
        where: {
          productId: row.productId,
          transaction: {
            storeId: store.id,
            type: "sale",
            transactionAt: { gte: thirtyStart, lte: now },
          },
        },
      });
      const sold = soldAgg._sum.quantity ?? 0;
      if (sold <= 0) continue;

      const ratio = shrinkQty / sold;
      if (ratio <= 0.05) continue;

      const product = await prisma.product.findUnique({
        where: { id: row.productId },
        select: { name: true },
      });
      const pct = (ratio * 100).toFixed(1);
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const recipients = await getManagerAdminUserIdsForStore(store.id);
      const created = await notifyUsers(recipients, {
        storeId: store.id,
        title: `Shrinkage alert: ${product?.name ?? "Product"}`,
        description: `Shrinkage (${shrinkQty} units) over the past 30 days exceeds 5% of units sold (${sold}) — ${pct}% of sales volume.`,
        severity: "critical",
        category: "shrinkage",
        linkUrl: `/store/${encodeURIComponent(store.id)}`,
        dedupeKeyForUser: (uid) => `shrinkage:${store.id}:${row.productId}:${monthKey}:${uid}`,
      });
      n += created;
    }
  }
  if (n) log.push(`shrinkage_ratio: ${n} notification(s)`);
  return n;
}

/**
 * Evaluates automated alert conditions and inserts notifications (idempotent per dedupe key).
 */
export async function runAlertChecks(): Promise<AlertCheckResult> {
  const log: string[] = [];
  let created = 0;
  created += await checkLowStock(log);
  created += await checkVoidRefundSpike(log);
  created += await checkStalePurchaseOrders(log);
  created += await checkAuditOverdue(log);
  created += await checkShrinkageRatio(log);
  if (created === 0) log.push("no new notifications");
  return { created, log };
}
