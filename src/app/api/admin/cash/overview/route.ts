import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { parseRangeQuery, startOfLocalDay, endOfLocalDay, formatLocalYMD } from "@/lib/sales/dates";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const range = parseRangeQuery(req.nextUrl.searchParams.get("dateFrom"), req.nextUrl.searchParams.get("dateTo"));
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });

  const stores = await prisma.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  const storeRows = await Promise.all(
    stores.map(async (s) => {
      const regs = await prisma.cashRegister.findMany({
        where: {
          storeId: s.id,
          status: "closed",
          closeVerifiedAt: { not: null },
          closedAt: { gte: range.from, lte: range.to },
        },
        select: { overShortAmount: true, id: true },
      });

      let totalAbsOverShort = 0;
      let warnCount = 0;
      let criticalCount = 0;
      for (const r of regs) {
        if (!r.overShortAmount) continue;
        const abs = Math.abs(r.overShortAmount.toNumber());
        totalAbsOverShort += abs;
        if (abs > 20) criticalCount++;
        else if (abs > 5) warnCount++;
      }

      const flagged = criticalCount > 0 || warnCount >= 3;
      return {
        storeId: s.id,
        storeName: s.name,
        totalAbsOverShort: totalAbsOverShort.toFixed(2),
        warnCount,
        criticalCount,
        flagged,
      };
    })
  );

  // 30-day trend: pick top stores by total abs over-short.
  const anchor = new Date();
  const trendStart = new Date(anchor);
  trendStart.setDate(trendStart.getDate() - 29);
  const trendFrom = startOfLocalDay(trendStart);
  const trendTo = endOfLocalDay(anchor);

  const storeAbsTotalsLast30 = await Promise.all(
    stores.map(async (s) => {
      const regs = await prisma.cashRegister.findMany({
        where: {
          storeId: s.id,
          status: "closed",
          closeVerifiedAt: { not: null },
          closedAt: { gte: trendFrom, lte: trendTo },
        },
        select: { overShortAmount: true },
      });
      let sum = 0;
      for (const r of regs) sum += r.overShortAmount ? Math.abs(r.overShortAmount.toNumber()) : 0;
      return { storeId: s.id, sum };
    })
  );

  const top = storeAbsTotalsLast30.sort((a, b) => b.sum - a.sum).slice(0, Math.min(6, stores.length));
  const topStores = stores.filter((s) => top.some((t) => t.storeId === s.id));

  const chartData: Array<Record<string, string | number>> = [];
  for (let d = 29; d >= 0; d--) {
    const day = new Date(trendFrom);
    day.setDate(day.getDate() + (29 - d));
    const ds = startOfLocalDay(day);
    const de = endOfLocalDay(day);
    const ymd = formatLocalYMD(ds);

    const row: Record<string, string | number> = { date: ymd };
    for (const s of topStores) {
      const regs = await prisma.cashRegister.findMany({
        where: {
          storeId: s.id,
          status: "closed",
          closeVerifiedAt: { not: null },
          closedAt: { gte: ds, lte: de },
        },
        select: { overShortAmount: true },
      });
      let sum = 0;
      for (const r of regs) sum += r.overShortAmount ? Math.abs(r.overShortAmount.toNumber()) : 0;
      row[s.name] = Number(sum.toFixed(2));
    }
    chartData.push(row);
  }

  return NextResponse.json({
    dateRange: { from: range.fromStr, to: range.toStr },
    stores: storeRows,
    chartData,
    chartStores: topStores.map((s) => ({ storeId: s.id, storeName: s.name })),
  });
}

