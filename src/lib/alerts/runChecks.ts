import { prisma } from "@/lib/prisma";
import { utcNoonFromYmd } from "@/lib/fuel/dates";
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

async function checkFuelTankLevels(log: string[]): Promise<number> {
  let n = 0;
  const tanks = await prisma.fuelData.findMany({
    include: { store: { select: { name: true } } },
  });
  const todayYmd = formatLocalYMD(new Date());

  for (const t of tanks) {
    const cap = Number(t.tankCapacityGallons);
    const vol = Number(t.currentVolumeGallons);
    if (cap <= 0) continue;
    const pct = (vol / cap) * 100;
    const recipients = await getManagerAdminUserIdsForStore(t.storeId);
    if (recipients.length === 0) continue;

    if (pct < 15) {
      const created = await notifyUsers(recipients, {
        storeId: t.storeId,
        title: `Critical fuel level — tank ${t.tankNumber} (${t.grade})`,
        description: `${t.store.name}: ${vol.toFixed(0)} gal / ${cap.toFixed(0)} gal (${pct.toFixed(1)}% full). Schedule a delivery.`,
        severity: "critical",
        category: "fuel_tank",
        linkUrl: `/store/${encodeURIComponent(t.storeId)}/fuel`,
        dedupeKeyForUser: (uid) => `fuel_tank_crit:${t.id}:${todayYmd}:${uid}`,
      });
      n += created;
      continue;
    }
    if (pct < 25) {
      const created = await notifyUsers(recipients, {
        storeId: t.storeId,
        title: `Low fuel — tank ${t.tankNumber} (${t.grade})`,
        description: `${t.store.name}: ${vol.toFixed(0)} gal / ${cap.toFixed(0)} gal (${pct.toFixed(1)}% full). Consider scheduling a delivery.`,
        severity: "warning",
        category: "fuel_tank",
        linkUrl: `/store/${encodeURIComponent(t.storeId)}/fuel`,
        dedupeKeyForUser: (uid) => `fuel_tank_warn:${t.id}:${todayYmd}:${uid}`,
      });
      n += created;
    }
  }
  if (n) log.push(`fuel_tank: ${n} notification(s)`);
  return n;
}

async function checkFoodserviceWasteRatio(log: string[]): Promise<number> {
  let n = 0;
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const todayYmd = formatLocalYMD(new Date());
  const todayStart = startOfLocalDay(new Date());
  const todayEnd = endOfLocalDay(new Date());

  for (const s of stores) {
    const [wasteSum, soldSum] = await Promise.all([
      prisma.foodserviceWasteLog.aggregate({
        where: { storeId: s.id, createdAt: { gte: todayStart, lte: todayEnd } },
        _sum: { quantity: true },
      }),
      prisma.foodserviceHotCaseEntry.aggregate({
        where: { storeId: s.id, status: "sold", disposedAt: { gte: todayStart, lte: todayEnd } },
        _sum: { quantityPlaced: true },
      }),
    ]);
    const w = wasteSum._sum.quantity ?? 0;
    const sold = soldSum._sum.quantityPlaced ?? 0;
    const throughput = w + sold;
    if (throughput <= 0) continue;
    const pct = (w / throughput) * 100;
    if (pct <= 15) continue;

    const recipients = await getManagerAdminUserIdsForStore(s.id);
    if (recipients.length === 0) continue;
    const created = await notifyUsers(recipients, {
      storeId: s.id,
      title: `Foodservice waste high — ${s.name}`,
      description: `Today's waste is ${pct.toFixed(1)}% of hot-case throughput (${w} units wasted vs ${sold} sold). Review production and hold times.`,
      severity: "warning",
      category: "foodservice",
      linkUrl: `/store/${encodeURIComponent(s.id)}/foodservice`,
      dedupeKeyForUser: (uid) => `foodservice_waste_pct:${s.id}:${todayYmd}:${uid}`,
    });
    n += created;
  }
  if (n) log.push(`foodservice_waste: ${n} notification(s)`);
  return n;
}

async function checkFoodserviceRecipeIngredients(log: string[]): Promise<number> {
  let n = 0;
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const todayYmd = formatLocalYMD(new Date());

  for (const s of stores) {
    const items = await prisma.foodserviceMenuItem.findMany({
      where: { storeId: s.id, active: true },
      include: { recipe: { include: { ingredients: true } } },
    });
    const shortNames = new Set<string>();
    for (const m of items) {
      if (!m.recipe) continue;
      for (const ing of m.recipe.ingredients) {
        const inv = await prisma.inventory.findUnique({
          where: { storeId_productId: { storeId: s.id, productId: ing.productId } },
          include: { product: { select: { name: true } } },
        });
        const qoh = inv?.quantityOnHand ?? 0;
        const min = inv?.minStockThreshold ?? 0;
        const need = Number(ing.quantityPerBatch);
        if (qoh < need || qoh <= min) {
          shortNames.add(inv?.product.name ?? ing.productId);
        }
      }
    }
    if (shortNames.size === 0) continue;

    const recipients = await getManagerAdminUserIdsForStore(s.id);
    if (recipients.length === 0) continue;
    const list = [...shortNames].slice(0, 5).join(", ");
    const created = await notifyUsers(recipients, {
      storeId: s.id,
      title: `Foodservice ingredients low — ${s.name}`,
      description: `Some recipe ingredients are at or below minimum or short for a batch: ${list}${shortNames.size > 5 ? "…" : ""}.`,
      severity: "warning",
      category: "foodservice",
      linkUrl: `/store/${encodeURIComponent(s.id)}/foodservice`,
      dedupeKeyForUser: (uid) => `foodservice_recipe_stock:${s.id}:${todayYmd}:${uid}`,
    });
    n += created;
  }
  if (n) log.push(`foodservice_recipe_stock: ${n} notification(s)`);
  return n;
}

async function checkLotteryStalePacks(log: string[]): Promise<number> {
  let n = 0;
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const todayYmd = formatLocalYMD(new Date());
  const packs = await prisma.lotteryPack.findMany({
    where: { status: "activated", activatedAt: { lt: fourteenDaysAgo } },
    include: { store: { select: { name: true } } },
  });
  for (const p of packs) {
    const recipients = await getManagerAdminUserIdsForStore(p.storeId);
    if (recipients.length === 0) continue;
    const created = await notifyUsers(recipients, {
      storeId: p.storeId,
      title: `Lottery pack stale — ${p.store.name}`,
      description: `Pack ${p.packNumber} (${p.gameName}) has been active over 14 days without settlement.`,
      severity: "warning",
      category: "lottery",
      linkUrl: `/store/${encodeURIComponent(p.storeId)}/lottery`,
      dedupeKeyForUser: (uid) => `lottery_stale:${p.id}:${todayYmd}:${uid}`,
    });
    n += created;
  }
  if (n) log.push(`lottery_stale: ${n} notification(s)`);
  return n;
}

async function checkLotterySettlementOverShortCritical(log: string[]): Promise<number> {
  let n = 0;
  const todayStart = startOfLocalDay(new Date());
  const todayEnd = endOfLocalDay(new Date());
  const settlements = await prisma.lotterySettlement.findMany({
    where: { createdAt: { gte: todayStart, lte: todayEnd } },
    include: { store: { select: { name: true } } },
  });
  for (const s of settlements) {
    if (Math.abs(Number(s.overShortAmount)) <= 20) continue;
    const recipients = await getManagerAdminUserIdsForStore(s.storeId);
    if (recipients.length === 0) continue;
    const created = await notifyUsers(recipients, {
      storeId: s.storeId,
      title: `Lottery settlement variance — ${s.store.name}`,
      description: `A pack settlement has over/short of $${Number(s.overShortAmount).toFixed(2)} (exceeds $20).`,
      severity: "critical",
      category: "lottery",
      linkUrl: `/store/${encodeURIComponent(s.storeId)}/lottery`,
      dedupeKeyForUser: (uid) => `lottery_os_crit:${s.id}:${uid}`,
    });
    n += created;
  }
  if (n) log.push(`lottery_settlement_os: ${n} notification(s)`);
  return n;
}

async function checkLotteryDailyOverShort(log: string[]): Promise<number> {
  let n = 0;
  const todayYmd = formatLocalYMD(new Date());
  const summaryDate = utcNoonFromYmd(todayYmd);
  const summaries = await prisma.lotteryDailySummary.findMany({
    where: { summaryDate },
  });
  for (const sum of summaries) {
    if (Math.abs(Number(sum.totalOverShort)) <= 50) continue;
    const store = await prisma.store.findUnique({ where: { id: sum.storeId }, select: { name: true } });
    const recipients = await getManagerAdminUserIdsForStore(sum.storeId);
    if (recipients.length === 0) continue;
    const created = await notifyUsers(recipients, {
      storeId: sum.storeId,
      title: `Lottery daily over/short — ${store?.name ?? sum.storeId}`,
      description: `Today's cumulative lottery over/short is $${Number(sum.totalOverShort).toFixed(2)} (threshold $50).`,
      severity: "warning",
      category: "lottery",
      linkUrl: `/store/${encodeURIComponent(sum.storeId)}/lottery`,
      dedupeKeyForUser: (uid) => `lottery_daily_os:${sum.storeId}:${todayYmd}:${uid}`,
    });
    n += created;
  }
  if (n) log.push(`lottery_daily_os: ${n} notification(s)`);
  return n;
}

async function checkFoodserviceMorningPrep(log: string[]): Promise<number> {
  const hour = new Date().getHours();
  if (hour < 6 || hour > 10) return 0;

  let n = 0;
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const todayYmd = formatLocalYMD(new Date());

  for (const s of stores) {
    const recipients = await getManagerAdminUserIdsForStore(s.id);
    if (recipients.length === 0) continue;
    const created = await notifyUsers(recipients, {
      storeId: s.id,
      title: `Production plan — ${s.name}`,
      description: `Review today's suggested prep quantities in Foodservice → Production planning.`,
      severity: "info",
      category: "foodservice",
      linkUrl: `/store/${encodeURIComponent(s.id)}/foodservice`,
      dedupeKeyForUser: (uid) => `foodservice_morning:${s.id}:${todayYmd}:${uid}`,
    });
    n += created;
  }
  if (n) log.push(`foodservice_morning: ${n} notification(s)`);
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
  created += await checkFuelTankLevels(log);
  created += await checkFoodserviceWasteRatio(log);
  created += await checkFoodserviceRecipeIngredients(log);
  created += await checkFoodserviceMorningPrep(log);
  created += await checkLotteryStalePacks(log);
  created += await checkLotterySettlementOverShortCritical(log);
  created += await checkLotteryDailyOverShort(log);
  if (created === 0) log.push("no new notifications");
  return { created, log };
}
