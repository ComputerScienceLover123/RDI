import type { HqReportType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fuelGallonsSoldByTankInRange } from "@/lib/reports/fuelSold";
import type { HqReportPayload, ReportTable } from "@/lib/reports/types";
import { reportTypeTitle } from "@/lib/reports/types";
import { endOfLocalDay, formatLocalYMD, startOfLocalDay } from "@/lib/sales/dates";
import { utcNoonFromYmd, ymdFromDbDate } from "@/lib/fuel/dates";

function shiftMinutes(start: number, end: number): number {
  if (end > start) return end - start;
  return 24 * 60 - start + end;
}

function mondayKey(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return formatLocalYMD(x);
}

export async function buildHqReportData(
  reportType: HqReportType,
  storeIds: string[],
  range: { from: Date; to: Date; fromStr: string; toStr: string },
): Promise<HqReportPayload | { error: string }> {
  const { from, to, fromStr, toStr } = range;
  const title = `${reportTypeTitle(reportType)} (${fromStr} – ${toStr})`;

  switch (reportType) {
    case "sales_summary":
      return buildSalesSummary(title, storeIds, from, to);
    case "inventory_valuation":
      return buildInventory(title, storeIds);
    case "purchase_order_summary":
      return buildPurchaseOrders(title, storeIds, from, to);
    case "labor_summary":
      return buildLabor(title, storeIds, from, to);
    case "fuel_performance":
      return buildFuel(title, storeIds, fromStr, toStr);
    case "foodservice":
      return buildFoodservice(title, storeIds, from, to);
    case "lottery":
      return buildLottery(title, storeIds, from, to);
    case "scan_data":
      return buildScanData(title, storeIds, from, to);
    case "shrinkage":
      return buildShrinkage(title, storeIds, from, to);
    default:
      return { error: "Unsupported report type" };
  }
}

async function buildSalesSummary(
  title: string,
  storeIds: string[],
  from: Date,
  to: Date,
): Promise<HqReportPayload> {
  const txs = await prisma.posTransaction.findMany({
    where: {
      storeId: { in: storeIds },
      transactionAt: { gte: from, lte: to },
      type: "sale",
    },
  });
  const totalSales = txs.reduce((a, t) => a + Number(t.total), 0);
  const txnCount = txs.length;
  const avgTicket = txnCount ? totalSales / txnCount : 0;

  const payMap = new Map<string, number>();
  for (const t of txs) {
    const k = t.paymentMethod;
    payMap.set(k, (payMap.get(k) ?? 0) + Number(t.total));
  }

  const lines = await prisma.transactionLineItem.findMany({
    where: {
      transaction: {
        storeId: { in: storeIds },
        transactionAt: { gte: from, lte: to },
        type: "sale",
      },
    },
    include: { product: { select: { name: true, category: true } } },
  });

  const catMap = new Map<string, number>();
  const prodRev = new Map<string, { name: string; rev: number }>();
  for (const li of lines) {
    const c = li.product.category;
    catMap.set(c, (catMap.get(c) ?? 0) + Number(li.lineTotal));
    const prev = prodRev.get(li.productId) ?? { name: li.product.name, rev: 0 };
    prev.rev += Number(li.lineTotal);
    prodRev.set(li.productId, prev);
  }

  const top20 = [...prodRev.entries()]
    .sort((a, b) => b[1].rev - a[1].rev)
    .slice(0, 20);

  const tables: ReportTable[] = [
    {
      title: "Overview",
      columns: ["Metric", "Value"],
      rows: [
        ["Total sales (sales only)", totalSales.toFixed(2)],
        ["Transaction count", txnCount],
        ["Average ticket", avgTicket.toFixed(2)],
      ],
    },
    {
      title: "Sales by category",
      columns: ["Category", "Revenue"],
      rows: [...catMap.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v.toFixed(2)]),
    },
    {
      title: "Sales by payment method",
      columns: ["Method", "Revenue"],
      rows: [...payMap.entries()].map(([k, v]) => [k, v.toFixed(2)]),
    },
    {
      title: "Top 20 products by revenue",
      columns: ["Product", "Revenue"],
      rows: top20.map(([, v]) => [v.name, v.rev.toFixed(2)]),
    },
  ];

  return { reportType: "sales_summary", title, tables };
}

async function buildInventory(title: string, storeIds: string[]): Promise<HqReportPayload> {
  const inv = await prisma.inventory.findMany({
    where: { storeId: { in: storeIds } },
    include: {
      product: true,
      store: { select: { name: true } },
    },
  });

  const overrides = await prisma.storeProductPriceOverride.findMany({
    where: { storeId: { in: storeIds } },
  });
  const ovMap = new Map<string, string>();
  for (const o of overrides) ovMap.set(`${o.storeId}|${o.productId}`, o.retailPrice.toString());

  type CatAgg = { qty: number; cost: number; retail: number };
  const byStoreCat = new Map<string, Map<string, CatAgg>>();
  let chainCost = 0;
  let chainRetail = 0;

  for (const row of inv) {
    const retail = Number(ovMap.get(`${row.storeId}|${row.productId}`) ?? row.product.retailPrice);
    const cost = Number(row.product.costPrice);
    const q = row.quantityOnHand;
    const lineCost = cost * q;
    const lineRetail = retail * q;
    chainCost += lineCost;
    chainRetail += lineRetail;

    if (!byStoreCat.has(row.storeId)) byStoreCat.set(row.storeId, new Map());
    const sm = byStoreCat.get(row.storeId)!;
    const cat = row.product.category;
    const agg = sm.get(cat) ?? { qty: 0, cost: 0, retail: 0 };
    agg.qty += q;
    agg.cost += lineCost;
    agg.retail += lineRetail;
    sm.set(cat, agg);
  }

  const storeNames = await prisma.store.findMany({
    where: { id: { in: storeIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(storeNames.map((s) => [s.id, s.name]));

  const tables: ReportTable[] = [
    {
      title: "Chain-wide totals",
      columns: ["", "Cost value", "Retail value"],
      rows: [
        ["All stores / categories", chainCost.toFixed(2), chainRetail.toFixed(2)],
      ],
    },
  ];

  for (const sid of storeIds) {
    const sm = byStoreCat.get(sid);
    if (!sm) continue;
    const rows: (string | number)[][] = [];
    for (const [cat, agg] of [...sm.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      rows.push([cat, agg.qty, agg.cost.toFixed(2), agg.retail.toFixed(2)]);
    }
    tables.push({
      title: `Store: ${nameById.get(sid) ?? sid}`,
      columns: ["Category", "Qty", "Cost value", "Retail value"],
      rows,
    });
  }

  return { reportType: "inventory_valuation", title, tables };
}

async function buildPurchaseOrders(
  title: string,
  storeIds: string[],
  from: Date,
  to: Date,
): Promise<HqReportPayload> {
  const pos = await prisma.purchaseOrder.findMany({
    where: {
      storeId: { in: storeIds },
      dateOrdered: { gte: from, lte: to },
    },
    include: {
      vendor: { select: { companyName: true } },
      store: { select: { name: true } },
    },
    orderBy: { dateOrdered: "desc" },
  });

  const vendorSpend = new Map<string, number>();
  for (const p of pos) {
    const v = p.vendor.companyName;
    vendorSpend.set(v, (vendorSpend.get(v) ?? 0) + Number(p.totalCost));
  }

  const tables: ReportTable[] = [
    {
      title: "Purchase orders",
      columns: ["PO id", "Vendor", "Store", "Status", "Ordered", "Total cost"],
      rows: pos.map((p) => [
        p.id.slice(0, 8),
        p.vendor.companyName,
        p.store.name,
        p.status,
        formatLocalYMD(p.dateOrdered),
        Number(p.totalCost).toFixed(2),
      ]),
    },
    {
      title: "Total spend by vendor",
      columns: ["Vendor", "Spend"],
      rows: [...vendorSpend.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v.toFixed(2)]),
    },
  ];

  return { reportType: "purchase_order_summary", title, tables };
}

async function buildLabor(
  title: string,
  storeIds: string[],
  from: Date,
  to: Date,
): Promise<HqReportPayload> {
  const fromD = startOfLocalDay(from);
  const toD = startOfLocalDay(to);

  const shifts = await prisma.shift.findMany({
    where: {
      storeId: { in: storeIds },
      shiftDate: { gte: fromD, lte: toD },
    },
    include: {
      employee: { select: { firstName: true, lastName: true, id: true } },
      store: { select: { name: true } },
    },
  });

  const byStore = new Map<string, number>();
  const byEmp = new Map<string, { name: string; hours: number }>();
  const weekEmp = new Map<string, number>();

  for (const s of shifts) {
    const mins = shiftMinutes(s.startMinutes, s.endMinutes);
    const hrs = mins / 60;
    byStore.set(s.storeId, (byStore.get(s.storeId) ?? 0) + hrs);
    const en = `${s.employee.firstName} ${s.employee.lastName}`;
    const prev = byEmp.get(s.employeeId) ?? { name: en, hours: 0 };
    prev.hours += hrs;
    byEmp.set(s.employeeId, prev);

    const wk = mondayKey(s.shiftDate);
    const key = `${s.employeeId}|${wk}`;
    weekEmp.set(key, (weekEmp.get(key) ?? 0) + hrs);
  }

  const storeNames = await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } });
  const sn = new Map(storeNames.map((x) => [x.id, x.name]));

  const over40: string[] = [];
  for (const [key, hrs] of weekEmp) {
    if (hrs > 40) {
      const [eid, wk] = key.split("|");
      const name = byEmp.get(eid!)?.name ?? eid;
      over40.push(`${name} — week ${wk}: ${hrs.toFixed(1)} h`);
    }
  }

  const tables: ReportTable[] = [
    {
      title: "Scheduled hours by store",
      columns: ["Store", "Hours"],
      rows: storeIds.map((id) => [sn.get(id) ?? id, (byStore.get(id) ?? 0).toFixed(2)]),
    },
    {
      title: "Scheduled hours by employee",
      columns: ["Employee", "Hours"],
      rows: [...byEmp.values()].sort((a, b) => b.hours - a.hours).map((x) => [x.name, x.hours.toFixed(2)]),
    },
    {
      title: "Over 40 hours in a week (Mon–Sun)",
      columns: ["Flag"],
      rows: over40.length ? over40.map((x) => [x]) : [["None"]],
    },
  ];

  return { reportType: "labor_summary", title, tables };
}

async function buildFuel(
  title: string,
  storeIds: string[],
  fromStr: string,
  toStr: string,
): Promise<HqReportPayload> {
  const tables: ReportTable[] = [];

  for (const sid of storeIds) {
    const tanks = await prisma.fuelData.findMany({ where: { storeId: sid } });
    const sold = await fuelGallonsSoldByTankInRange(sid, fromStr, toStr);
    const deliveries = await prisma.fuelDelivery.findMany({
      where: {
        storeId: sid,
        deliveryDate: {
          gte: utcNoonFromYmd(fromStr),
          lte: utcNoonFromYmd(toStr),
        },
      },
      include: { tank: { select: { grade: true, tankNumber: true } } },
    });

    const gradeGallons = new Map<string, number>();
    const gradeRev = new Map<string, number>();
    for (const t of tanks) {
      const g = t.grade;
      const gal = sold.get(t.id) ?? 0;
      gradeGallons.set(g, (gradeGallons.get(g) ?? 0) + gal);
      const price = Number(t.currentRetailPricePerGallon);
      gradeRev.set(g, (gradeRev.get(g) ?? 0) + gal * price);
    }

    const store = await prisma.store.findUnique({ where: { id: sid } });

    tables.push({
      title: `Fuel — ${store?.name ?? sid} — gallons sold (est.)`,
      columns: ["Grade", "Gallons", "Revenue @ current price"],
      rows: [...gradeGallons.entries()].map(([g, gal]) => [
        g,
        gal.toFixed(1),
        (gradeRev.get(g) ?? 0).toFixed(2),
      ]),
    });

    tables.push({
      title: `Current tank levels — ${store?.name ?? sid}`,
      columns: ["Tank", "Grade", "Gallons", "Capacity", "Fill %"],
      rows: tanks.map((t) => {
        const cap = Number(t.tankCapacityGallons);
        const vol = Number(t.currentVolumeGallons);
        const pct = cap > 0 ? (vol / cap) * 100 : 0;
        return [String(t.tankNumber), t.grade, vol.toFixed(0), cap.toFixed(0), pct.toFixed(1)];
      }),
    });

    tables.push({
      title: `Deliveries — ${store?.name ?? sid}`,
      columns: ["Date", "Tank", "Grade", "Gallons"],
      rows: deliveries.map((d) => [
        formatLocalYMD(new Date(d.deliveryDate)),
        String(d.tank.tankNumber),
        d.tank.grade,
        Number(d.volumeGallons).toFixed(1),
      ]),
    });
  }

  return { reportType: "fuel_performance", title, tables };
}

async function buildFoodservice(
  title: string,
  storeIds: string[],
  from: Date,
  to: Date,
): Promise<HqReportPayload> {
  const plans = await prisma.productionPlan.findMany({
    where: {
      storeId: { in: storeIds },
      planDate: { gte: from, lte: to },
    },
    include: {
      lines: { include: { menuItem: { select: { itemName: true, retailPrice: true } } } },
      store: { select: { name: true } },
    },
  });

  const prodRows: (string | number)[][] = [];
  const produced = new Map<string, number>();
  for (const pl of plans) {
    for (const l of pl.lines) {
      prodRows.push([pl.store.name, l.menuItem.itemName, l.quantityFinal]);
      const k = `${pl.storeId}:${l.menuItem.itemName}`;
      produced.set(k, (produced.get(k) ?? 0) + l.quantityFinal);
    }
  }

  const waste = await prisma.foodserviceWasteLog.findMany({
    where: {
      storeId: { in: storeIds },
      createdAt: { gte: from, lte: to },
    },
    include: {
      menuItem: { select: { itemName: true, retailPrice: true } },
      store: { select: { name: true } },
    },
  });

  const wasteBy = new Map<string, { qty: number; dollars: number }>();
  const wasteRows: (string | number)[][] = [];
  let wasteQty = 0;
  let wasteDollars = 0;
  for (const w of waste) {
    const k = `${w.storeId}:${w.menuItem.itemName}`;
    const dollars = Number(w.menuItem.retailPrice) * w.quantity;
    wasteQty += w.quantity;
    wasteDollars += dollars;
    wasteRows.push([w.store.name, w.menuItem.itemName, w.quantity, dollars.toFixed(2)]);
    const prev = wasteBy.get(k) ?? { qty: 0, dollars: 0 };
    prev.qty += w.quantity;
    prev.dollars += dollars;
    wasteBy.set(k, prev);
  }

  const producedTotal = [...produced.values()].reduce((a, b) => a + b, 0);
  const wastePct = producedTotal + wasteQty > 0 ? (wasteQty / (producedTotal + wasteQty)) * 100 : 0;

  const tables: ReportTable[] = [
    {
      title: "Summary",
      columns: ["Metric", "Value"],
      rows: [
        ["Items produced (units)", producedTotal],
        ["Items wasted (units)", wasteQty],
        ["Waste %", wastePct.toFixed(1)],
        ["Waste $ (retail est.)", wasteDollars.toFixed(2)],
      ],
    },
    {
      title: "Production by store & menu item",
      columns: ["Store", "Item", "Units"],
      rows: prodRows,
    },
    {
      title: "Waste by store & menu item",
      columns: ["Store", "Item", "Qty", "Retail $"],
      rows: wasteRows,
    },
  ];

  return { reportType: "foodservice", title, tables };
}

async function buildLottery(
  title: string,
  storeIds: string[],
  from: Date,
  to: Date,
): Promise<HqReportPayload> {
  const activated = await prisma.lotteryPack.count({
    where: {
      storeId: { in: storeIds },
      activatedAt: { gte: from, lte: to },
    },
  });

  const settledPacks = await prisma.lotteryPack.count({
    where: {
      storeId: { in: storeIds },
      status: "settled",
      settledAt: { gte: from, lte: to },
    },
  });

  const settlements = await prisma.lotterySettlement.findMany({
    where: {
      storeId: { in: storeIds },
      settlementDate: {
        gte: utcNoonFromYmd(formatLocalYMD(from)),
        lte: utcNoonFromYmd(formatLocalYMD(to)),
      },
    },
    include: { store: { select: { name: true } } },
  });

  const byStore = new Map<string, number>();
  let totalOs = 0;
  for (const s of settlements) {
    const os = Number(s.overShortAmount);
    totalOs += os;
    byStore.set(s.storeId, (byStore.get(s.storeId) ?? 0) + os);
  }

  const stores = await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } });
  const sn = new Map(stores.map((x) => [x.id, x.name]));

  const tables: ReportTable[] = [
    {
      title: "Chain summary",
      columns: ["Metric", "Value"],
      rows: [
        ["Packs activated", activated],
        ["Packs settled", settledPacks],
        ["Total over/short", totalOs.toFixed(2)],
      ],
    },
    {
      title: "Over/short by store",
      columns: ["Store", "Over/short"],
      rows: storeIds.map((id) => [sn.get(id) ?? id, (byStore.get(id) ?? 0).toFixed(2)]),
    },
  ];

  return { reportType: "lottery", title, tables };
}

async function buildScanData(
  title: string,
  storeIds: string[],
  from: Date,
  to: Date,
): Promise<HqReportPayload> {
  const fromD = startOfLocalDay(from);
  const toD = endOfLocalDay(to);

  const rows = await prisma.scanDataSubmission.findMany({
    where: {
      storeId: { in: storeIds },
      reportingPeriodStart: { lte: toD },
      reportingPeriodEnd: { gte: fromD },
    },
    include: {
      program: { select: { programName: true } },
      store: { select: { name: true } },
    },
  });

  const byProg = new Map<string, { rebate: number; paid: number }>();
  for (const r of rows) {
    const k = r.program.programName;
    const prev = byProg.get(k) ?? { rebate: 0, paid: 0 };
    prev.rebate += Number(r.totalRebateValueCalculated);
    if (r.status === "paid" && r.paymentAmountReceived != null) {
      prev.paid += Number(r.paymentAmountReceived);
    }
    byProg.set(k, prev);
  }

  const tables: ReportTable[] = [
    {
      title: "By program",
      columns: ["Program", "Calculated rebate", "Paid (if status=paid)"],
      rows: [...byProg.entries()].map(([name, v]) => [name, v.rebate.toFixed(2), v.paid.toFixed(2)]),
    },
    {
      title: "Detail",
      columns: ["Store", "Program", "Period", "Status", "Calc", "Paid"],
      rows: rows.map((r) => [
        r.store.name,
        r.program.programName,
        `${ymdFromDbDate(r.reportingPeriodStart)}–${ymdFromDbDate(r.reportingPeriodEnd)}`,
        r.status,
        Number(r.totalRebateValueCalculated).toFixed(2),
        r.paymentAmountReceived != null ? Number(r.paymentAmountReceived).toFixed(2) : "",
      ]),
    },
  ];

  return { reportType: "scan_data", title, tables };
}

async function buildShrinkage(
  title: string,
  storeIds: string[],
  from: Date,
  to: Date,
): Promise<HqReportPayload> {
  const fromD = startOfLocalDay(from);
  const toD = endOfLocalDay(to);

  const recs = await prisma.shrinkageRecord.findMany({
    where: {
      storeId: { in: storeIds },
      AND: [{ periodStart: { lte: toD } }, { periodEnd: { gte: fromD } }],
    },
    include: {
      product: { select: { name: true, category: true } },
      store: { select: { name: true } },
    },
  });

  const byStore = new Map<string, number>();
  const byProduct = new Map<string, number>();
  const byCat = new Map<string, number>();
  const byReason = new Map<string, number>();

  for (const r of recs) {
    const v = Number(r.estimatedLossValue);
    byStore.set(r.storeId, (byStore.get(r.storeId) ?? 0) + v);
    byProduct.set(r.product.name, (byProduct.get(r.product.name) ?? 0) + v);
    byCat.set(r.product.category, (byCat.get(r.product.category) ?? 0) + v);
    byReason.set(r.category, (byReason.get(r.category) ?? 0) + v);
  }

  const stores = await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } });
  const sn = new Map(stores.map((x) => [x.id, x.name]));

  const tables: ReportTable[] = [
    {
      title: "By store",
      columns: ["Store", "Loss $"],
      rows: storeIds.map((id) => [sn.get(id) ?? id, (byStore.get(id) ?? 0).toFixed(2)]),
    },
    {
      title: "By product",
      columns: ["Product", "Loss $"],
      rows: [...byProduct.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v.toFixed(2)]),
    },
    {
      title: "By category",
      columns: ["Category", "Loss $"],
      rows: [...byCat.entries()].map(([k, v]) => [k, v.toFixed(2)]),
    },
    {
      title: "By shrinkage reason",
      columns: ["Reason", "Loss $"],
      rows: [...byReason.entries()].map(([k, v]) => [k, v.toFixed(2)]),
    },
  ];

  return { reportType: "shrinkage", title, tables };
}
