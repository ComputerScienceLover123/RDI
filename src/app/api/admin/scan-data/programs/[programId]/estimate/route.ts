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

/** Projected monthly rebate from last 90 days velocity (all stores). */
export async function GET(_req: Request, { params }: { params: { programId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const program = await prisma.scanDataProgram.findUnique({
    where: { id: params.programId },
    include: { products: { select: { productId: true } } },
  });
  if (!program) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const productIds = program.products.map((p) => p.productId);
  if (productIds.length === 0) {
    return NextResponse.json({
      enrolledProductCount: 0,
      avgDailyUnits: 0,
      avgDailyRetail: "0",
      projectedMonthlyRebate: "0",
      windowDays: 90,
    });
  }

  const to = endOfLocalDay(new Date());
  const from = startOfLocalDay(new Date());
  from.setDate(from.getDate() - 90);

  const rows = await aggregateQualifyingSalesByStoreProduct(productIds, from, to);
  const { units, retail } = sumTotals(rows);
  const days = 90;
  const avgDailyUnits = units / days;
  const avgDailyRetail = retail.div(new Prisma.Decimal(days));
  const month = new Prisma.Decimal(30);
  const projectedUnits = new Prisma.Decimal(avgDailyUnits * 30);
  const projectedRetail = avgDailyRetail.mul(month);

  const projectedRebate = totalRebateForProgram(
    program.rebateType,
    program.rebateValue,
    projectedUnits.toNumber(),
    projectedRetail,
  );

  return NextResponse.json({
    enrolledProductCount: productIds.length,
    windowStart: formatLocalYMD(from),
    windowEnd: formatLocalYMD(to),
    windowDays: days,
    totalUnits90d: units,
    totalRetail90d: retail.toString(),
    avgDailyUnits,
    avgDailyRetail: avgDailyRetail.toString(),
    projectedMonthlyRebate: projectedRebate.toFixed(2),
  });
}
