import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAccessStore } from "@/lib/store/storeAccess";
import { canManagerViewStoreScanData } from "@/lib/store/scanDataAccess";
import {
  aggregateQualifyingSalesByStoreProduct,
  sumTotals,
  totalRebateForProgram,
} from "@/lib/scanData/aggregate";
import { endOfLocalDay, formatLocalYMD, startOfLocalDay } from "@/lib/sales/dates";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canAccessStore(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canManagerViewStoreScanData(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const programs = await prisma.scanDataProgram.findMany({
    where: { status: "active" },
    include: { products: { select: { productId: true } } },
    orderBy: { programName: "asc" },
  });

  const to = endOfLocalDay(new Date());
  const from = startOfLocalDay(new Date());
  from.setDate(from.getDate() - 30);

  const result: Array<{
    programId: string;
    programName: string;
    manufacturerName: string;
    paymentFrequency: string;
    enrolledProductCount: number;
    storeUnits30d: number;
    storeEstimatedRebate30d: string;
  }> = [];

  for (const prog of programs) {
    const productIds = prog.products.map((p) => p.productId);
    if (productIds.length === 0) {
      result.push({
        programId: prog.id,
        programName: prog.programName,
        manufacturerName: prog.manufacturerName,
        paymentFrequency: prog.paymentFrequency,
        enrolledProductCount: 0,
        storeUnits30d: 0,
        storeEstimatedRebate30d: "0.00",
      });
      continue;
    }
    const rows = await aggregateQualifyingSalesByStoreProduct(productIds, from, to);
    const storeRows = rows.filter((r) => r.storeId === storeId);
    const { units, retail } = sumTotals(storeRows);
    const rebate = totalRebateForProgram(prog.rebateType, prog.rebateValue, units, retail);
    result.push({
      programId: prog.id,
      programName: prog.programName,
      manufacturerName: prog.manufacturerName,
      paymentFrequency: prog.paymentFrequency,
      enrolledProductCount: productIds.length,
      storeUnits30d: units,
      storeEstimatedRebate30d: rebate.toFixed(2),
    });
  }

  const totalEst = result.reduce((acc, r) => acc.add(new Prisma.Decimal(r.storeEstimatedRebate30d)), new Prisma.Decimal(0));

  return NextResponse.json({
    windowStart: formatLocalYMD(from),
    windowEnd: formatLocalYMD(to),
    storeTotalEstimatedRebate30d: totalEst.toFixed(2),
    programs: result,
  });
}
