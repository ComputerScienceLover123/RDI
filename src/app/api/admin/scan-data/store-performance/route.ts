import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import {
  aggregateQualifyingSalesByStoreProduct,
  sumTotals,
  totalRebateForProgram,
} from "@/lib/scanData/aggregate";
import { endOfLocalDay, formatLocalYMD, startOfLocalDay } from "@/lib/sales/dates";

export const runtime = "nodejs";

/** Estimated rebate by store from last 90 days of sales across all active programs. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const programs = await prisma.scanDataProgram.findMany({
    where: { status: "active" },
    include: { products: { select: { productId: true } } },
  });

  const to = endOfLocalDay(new Date());
  const from = startOfLocalDay(new Date());
  from.setDate(from.getDate() - 90);

  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const storeRebate = new Map<string, Prisma.Decimal>();
  for (const s of stores) storeRebate.set(s.id, new Prisma.Decimal(0));

  for (const prog of programs) {
    const productIds = prog.products.map((p) => p.productId);
    if (productIds.length === 0) continue;
    const rows = await aggregateQualifyingSalesByStoreProduct(productIds, from, to);
    const byStore = new Map<string, typeof rows>();
    for (const r of rows) {
      if (!byStore.has(r.storeId)) byStore.set(r.storeId, []);
      byStore.get(r.storeId)!.push(r);
    }
    for (const s of stores) {
      const sr = byStore.get(s.id) ?? [];
      const { units, retail } = sumTotals(sr);
      const rebate = totalRebateForProgram(prog.rebateType, prog.rebateValue, units, retail);
      const prev = storeRebate.get(s.id)!;
      storeRebate.set(s.id, prev.add(rebate));
    }
  }

  const rows = stores
    .map((s) => ({
      storeId: s.id,
      storeName: s.name,
      estimatedRebate90d: storeRebate.get(s.id)!.toFixed(2),
    }))
    .sort((a, b) => Number(b.estimatedRebate90d) - Number(a.estimatedRebate90d));

  return NextResponse.json({
    windowStart: formatLocalYMD(from),
    windowEnd: formatLocalYMD(to),
    windowDays: 90,
    stores: rows,
  });
}
