import { prisma } from "@/lib/prisma";
import { completedPeriodIfDueToday } from "@/lib/scanData/duePeriods";
import { utcNoonFromYmd } from "@/lib/fuel/dates";
import { endOfLocalDay, formatLocalYMD, startOfLocalDay } from "@/lib/sales/dates";
import { getAdminUserIds } from "@/lib/alerts/recipients";
import { Prisma } from "@prisma/client";
import type { NotificationCategory, NotificationSeverity } from "@prisma/client";
import { categoryAllowedByPreference, getOrCreateNotificationPreferences } from "./preferences";
import { getManagerAdminUserIdsForStore, getManagerUserIdsForStore } from "./recipients";
import { calcSafeExpectedBalanceBeforeTimestamp } from "@/lib/cash/calc";

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

async function checkScanDataReportDue(log: string[]): Promise<number> {
  let n = 0;
  const programs = await prisma.scanDataProgram.findMany({
    where: { status: "active" },
  });
  const adminIds = await getAdminUserIds();
  if (adminIds.length === 0) return 0;

  for (const p of programs) {
    const due = completedPeriodIfDueToday(p.paymentFrequency);
    if (!due) continue;
    for (const uid of adminIds) {
      const prefs = await getOrCreateNotificationPreferences(uid);
      if (!categoryAllowedByPreference(prefs, "scan_data")) continue;
      const dk = `scan_due:${p.id}:${due.periodKey}:${uid}`;
      const exists = await prisma.notification.findFirst({ where: { recipientUserId: uid, dedupeKey: dk } });
      if (exists) continue;
      await prisma.notification.create({
        data: {
          storeId: null,
          recipientUserId: uid,
          title: `Scan data report due — ${p.programName}`,
          description: `Submit ${p.manufacturerName} scan data for ${due.label}.`,
          severity: "info",
          category: "scan_data",
          linkUrl: "/admin/scan-data",
          dedupeKey: dk,
        },
      });
      n++;
    }
  }
  if (n) log.push(`scan_data_due: ${n} notification(s)`);
  return n;
}

async function checkScanDataSubmissionOverdue(log: string[]): Promise<number> {
  let n = 0;
  const cutoff = startOfLocalDay(new Date());
  cutoff.setDate(cutoff.getDate() - 7);

  const overdue = await prisma.scanDataSubmission.findMany({
    where: {
      status: "pending",
      reportingPeriodEnd: { lt: cutoff },
    },
    include: { program: { select: { programName: true } }, store: { select: { name: true } } },
  });

  const adminIds = await getAdminUserIds();
  for (const s of overdue) {
    for (const uid of adminIds) {
      const prefs = await getOrCreateNotificationPreferences(uid);
      if (!categoryAllowedByPreference(prefs, "scan_data")) continue;
      const dk = `scan_overdue:${s.id}:${uid}`;
      const exists = await prisma.notification.findFirst({ where: { recipientUserId: uid, dedupeKey: dk } });
      if (exists) continue;
      await prisma.notification.create({
        data: {
          storeId: s.storeId,
          recipientUserId: uid,
          title: `Scan data overdue — ${s.program.programName}`,
          description: `${s.store.name}: period ending ${formatLocalYMD(s.reportingPeriodEnd)} is still pending (over 7 days).`,
          severity: "warning",
          category: "scan_data",
          linkUrl: "/admin/scan-data",
          dedupeKey: dk,
        },
      });
      n++;
    }
  }
  if (n) log.push(`scan_data_overdue: ${n} notification(s)`);
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
  created += await checkScanDataReportDue(log);
  created += await checkScanDataSubmissionOverdue(log);
  created += await checkAgeRestrictedSaleGaps(log);
  created += await checkEmployeeAgeVerificationRate7d(log);
  created += await checkDailyComplianceSummary(log);
  created += await checkCashRegisterOverShort(log);
  created += await checkCashSafeCountMismatch(log);
  created += await checkCashDailyReconciliationSummary(log);
  if (created === 0) log.push("no new notifications");
  return { created, log };
}

async function checkCashRegisterOverShort(log: string[]): Promise<number> {
  // Registers verified/approved by a manager; notify based on absolute over/short.
  let n = 0;
  const now = new Date();
  const start = startOfLocalDay(new Date(now));
  start.setDate(start.getDate() - 1);
  const end = endOfLocalDay(now);

  const registers = await prisma.cashRegister.findMany({
    where: { status: "closed", closeVerifiedAt: { not: null }, closedAt: { gte: start, lte: end } },
    select: {
      id: true,
      storeId: true,
      registerName: true,
      overShortAmount: true,
      closedByEmployeeId: true,
      closeVerifiedAt: true,
    },
  });

  for (const r of registers) {
    const overShortAmount = r.overShortAmount ?? undefined;
    if (!overShortAmount) continue;
    const abs = Math.abs(overShortAmount.toNumber());
    const severity: NotificationSeverity | null = abs > 20 ? "critical" : abs > 5 ? "warning" : null;
    if (!severity) continue;

    const recipients = await getManagerAdminUserIdsForStore(r.storeId);
    if (recipients.length === 0) continue;

    const title = `Cash register ${r.registerName}: over/short ${overShortAmount.toFixed(2)}`;
    const desc = `Register was closed and manager-verified at ${r.closeVerifiedAt?.toISOString()}. Absolute variance is $${abs.toFixed(
      2
    )}.`;

    const created = await notifyUsers(recipients, {
      storeId: r.storeId,
      title,
      description: desc,
      severity,
      category: "cash",
      linkUrl: `/store/${encodeURIComponent(r.storeId)}/cash`,
      dedupeKeyForUser: (uid) => `cash_close_os:${r.id}:${uid}`,
    });
    n += created;
  }

  if (n) log.push(`cash_register_over_short: ${n} notification(s)`);
  return n;
}

async function checkCashSafeCountMismatch(log: string[]): Promise<number> {
  let n = 0;
  const now = new Date();
  const start = startOfLocalDay(new Date(now));
  start.setDate(start.getDate() - 1);
  const end = endOfLocalDay(now);

  const safeCounts = await prisma.cashCount.findMany({
    where: { countType: "safe_count", verifiedAt: { not: null }, timestamp: { gte: start, lte: end } },
    select: {
      id: true,
      storeId: true,
      timestamp: true,
      totalCountedAmount: true,
    },
  });

  for (const c of safeCounts) {
    const expectedBefore = await calcSafeExpectedBalanceBeforeTimestamp({ storeId: c.storeId, safeCountAt: c.timestamp });
    const mismatch = c.totalCountedAmount.sub(expectedBefore.expectedSafeBalance);
    const abs = Math.abs(mismatch.toNumber());
    if (abs <= 25) continue;

    const recipients = await getManagerAdminUserIdsForStore(c.storeId);
    if (recipients.length === 0) continue;

    const created = await notifyUsers(recipients, {
      storeId: c.storeId,
      title: `Cash safe count mismatch: $${mismatch.toFixed(2)}`,
      description: `Safe count at ${c.timestamp.toISOString()} differed from expected balance by $${abs.toFixed(
        2
      )} (threshold $25).`,
      severity: "warning",
      category: "cash",
      linkUrl: `/store/${encodeURIComponent(c.storeId)}/cash`,
      dedupeKeyForUser: (uid) => `cash_safe_mismatch:${c.id}:${uid}`,
    });
    n += created;
  }

  if (n) log.push(`cash_safe_mismatch: ${n} notification(s)`);
  return n;
}

async function checkCashDailyReconciliationSummary(log: string[]): Promise<number> {
  let n = 0;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const dayStart = startOfLocalDay(y);
  const dayEnd = endOfLocalDay(y);
  const dayYmd = formatLocalYMD(dayStart);

  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  for (const s of stores) {
    const registers = await prisma.cashRegister.findMany({
      where: {
        storeId: s.id,
        status: "closed",
        closeVerifiedAt: { not: null },
        openedAt: { gte: dayStart, lte: dayEnd },
        closedAt: { gte: dayStart, lte: dayEnd },
      },
      select: { overShortAmount: true },
    });
    if (registers.length === 0) continue;

    const totalOverShort = registers.reduce((acc, r) => acc + (r.overShortAmount ? r.overShortAmount.toNumber() : 0), 0);

    const safeDropsAgg = await prisma.cashDrop.aggregate({
      where: { storeId: s.id, dropType: "safe_drop", droppedAt: { gte: dayStart, lte: dayEnd } },
      _sum: { amountDropped: true },
    });
    const safeDrops = safeDropsAgg._sum.amountDropped ?? new Prisma.Decimal(0);

    const lastSafeCount = await prisma.cashCount.findFirst({
      where: { storeId: s.id, registerId: null, countType: "safe_count", timestamp: { lte: dayEnd } },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true, totalCountedAmount: true },
    });

    let safeExpectedStr: string | null = null;
    let safeCountedStr: string | null = null;
    if (lastSafeCount) {
      const expectedBefore = await calcSafeExpectedBalanceBeforeTimestamp({
        storeId: s.id,
        safeCountAt: lastSafeCount.timestamp,
      });
      safeExpectedStr = expectedBefore.expectedSafeBalance.toFixed(2);
      safeCountedStr = lastSafeCount.totalCountedAmount.toFixed(2);
    }

    const recipients = await getManagerAdminUserIdsForStore(s.id);
    if (recipients.length === 0) continue;

    const created = await notifyUsers(recipients, {
      storeId: s.id,
      title: `Daily cash reconciliation — ${s.name} (${dayYmd})`,
      description: `Verified register count: ${registers.length}. Total over/short (net): $${totalOverShort.toFixed(
        2
      )}. Safe drops: $${safeDrops.toFixed(2)}.${safeExpectedStr && safeCountedStr ? ` Safe expected: $${safeExpectedStr}; safe counted: $${safeCountedStr}.` : ""}`,
      severity: "info",
      category: "cash",
      linkUrl: `/store/${encodeURIComponent(s.id)}/cash`,
      dedupeKeyForUser: (uid) => `cash_daily_recon:${s.id}:${dayYmd}:${uid}`,
    });
    n += created;
  }

  if (n) log.push(`cash_daily_recon: ${n} notification(s)`);
  return n;
}

async function checkAgeRestrictedSaleGaps(log: string[]): Promise<number> {
  let n = 0;
  const todayStart = startOfLocalDay(new Date());
  const todayEnd = endOfLocalDay(new Date());
  const todayYmd = formatLocalYMD(new Date());

  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  for (const s of stores) {
    const gapCount = await prisma.transactionLineItem.count({
      where: {
        product: { ageRestricted: true },
        ageVerificationLog: null,
        transaction: {
          storeId: s.id,
          type: "sale",
          transactionAt: { gte: todayStart, lte: todayEnd },
        },
      },
    });
    if (gapCount === 0) continue;

    const recipients = await getManagerAdminUserIdsForStore(s.id);
    if (recipients.length === 0) continue;
    const created = await notifyUsers(recipients, {
      storeId: s.id,
      title: `Critical: age-restricted sales without verification — ${s.name}`,
      description: `${gapCount} age-restricted line item(s) sold today with no age verification log. Investigate immediately.`,
      severity: "critical",
      category: "compliance",
      linkUrl: `/store/${encodeURIComponent(s.id)}/compliance`,
      dedupeKeyForUser: (uid) => `age_gap:${s.id}:${todayYmd}:${uid}`,
    });
    n += created;
  }
  if (n) log.push(`age_compliance_gap: ${n} notification(s)`);
  return n;
}

async function checkEmployeeAgeVerificationRate7d(log: string[]): Promise<number> {
  let n = 0;
  const end = endOfLocalDay(new Date());
  const start = startOfLocalDay(new Date());
  start.setDate(start.getDate() - 7);
  const weekKey = formatLocalYMD(start);

  const employees = await prisma.user.findMany({
    where: { accountStatus: "active", role: { in: ["employee", "manager"] }, assignedStoreId: { not: null } },
    select: { id: true, assignedStoreId: true, firstName: true, lastName: true },
  });

  for (const e of employees) {
    const storeId = e.assignedStoreId!;
    const [appr, dec] = await Promise.all([
      prisma.ageVerificationLog.count({
        where: { employeeId: e.id, verifiedAt: { gte: start, lte: end }, result: "approved" },
      }),
      prisma.ageVerificationLog.count({
        where: { employeeId: e.id, verifiedAt: { gte: start, lte: end }, result: "declined" },
      }),
    ]);
    const denom = appr + dec;
    if (denom < 5) continue;
    if (dec === 0) continue;

    const rate = appr / denom;
    if (rate >= 1) continue;

    const managers = await getManagerAdminUserIdsForStore(storeId);
    if (managers.length === 0) continue;
    const name = `${e.firstName} ${e.lastName}`.trim();
    const created = await notifyUsers(managers, {
      storeId,
      title: `Age verification rate — ${name}`,
      description: `Past 7 days at this store: ${appr} approved vs ${dec} declined age checks (${(rate * 100).toFixed(1)}% approval). Consider refresher training.`,
      severity: "warning",
      category: "compliance",
      linkUrl: `/store/${encodeURIComponent(storeId)}/compliance`,
      dedupeKeyForUser: (uid) => `age_rate_emp:${e.id}:${weekKey}:${uid}`,
    });
    n += created;
  }
  if (n) log.push(`age_verification_rate: ${n} notification(s)`);
  return n;
}

async function checkDailyComplianceSummary(log: string[]): Promise<number> {
  let n = 0;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const dayStart = startOfLocalDay(y);
  const dayEnd = endOfLocalDay(y);
  const dayYmd = formatLocalYMD(dayStart);

  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  for (const s of stores) {
    const [appr, dec, gaps] = await Promise.all([
      prisma.ageVerificationLog.count({
        where: { storeId: s.id, result: "approved", verifiedAt: { gte: dayStart, lte: dayEnd } },
      }),
      prisma.ageVerificationLog.count({
        where: { storeId: s.id, result: "declined", verifiedAt: { gte: dayStart, lte: dayEnd } },
      }),
      prisma.transactionLineItem.count({
        where: {
          product: { ageRestricted: true },
          ageVerificationLog: null,
          transaction: {
            storeId: s.id,
            type: "sale",
            transactionAt: { gte: dayStart, lte: dayEnd },
          },
        },
      }),
    ]);
    const total = appr + dec;
    if (total === 0 && gaps === 0) continue;

    const recipients = await getManagerAdminUserIdsForStore(s.id);
    if (recipients.length === 0) continue;
    const rate = total > 0 ? ((appr / total) * 100).toFixed(1) : "—";
    const created = await notifyUsers(recipients, {
      storeId: s.id,
      title: `Daily age compliance — ${s.name} (${dayYmd})`,
      description: `Verifications: ${appr} approved, ${dec} declined (${rate}% approval rate). Age-restricted lines missing verification: ${gaps}.`,
      severity: "info",
      category: "compliance",
      linkUrl: `/store/${encodeURIComponent(s.id)}/compliance`,
      dedupeKeyForUser: (uid) => `age_daily_sum:${s.id}:${dayYmd}:${uid}`,
    });
    n += created;
  }
  if (n) log.push(`age_compliance_daily: ${n} notification(s)`);
  return n;
}
