import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import {
  aggregateQualifyingSalesByStoreProduct,
  sumTotals,
  totalRebateForProgram,
} from "@/lib/scanData/aggregate";
import { endOfLocalDay, formatLocalYMD, parseLocalYMD, startOfLocalDay } from "@/lib/sales/dates";

export const runtime = "nodejs";

const BodySchema = z.object({
  programId: z.string().min(1),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fileFormat: z.enum(["csv", "xml", "api"]).default("csv"),
  createSubmissions: z.boolean().optional(),
});

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const d = parsed.data;
  const createSubmissions = d.createSubmissions !== false;

  const ps = parseLocalYMD(d.periodStart);
  const pe = parseLocalYMD(d.periodEnd);
  if (!ps || !pe || ps.getTime() > pe.getTime()) {
    return NextResponse.json({ error: "Invalid period" }, { status: 400 });
  }
  const rangeStart = startOfLocalDay(ps);
  const rangeEnd = endOfLocalDay(pe);

  const program = await prisma.scanDataProgram.findUnique({
    where: { id: d.programId },
    include: { products: { select: { productId: true } } },
  });
  if (!program) return NextResponse.json({ error: "Program not found" }, { status: 404 });

  const productIds = program.products.map((p) => p.productId);
  if (productIds.length === 0) {
    return NextResponse.json({ error: "No products enrolled in program" }, { status: 400 });
  }

  const rows = await aggregateQualifyingSalesByStoreProduct(productIds, rangeStart, rangeEnd);
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const storeName = new Map(stores.map((s) => [s.id, s.name]));

  const periodStartStr = formatLocalYMD(ps);
  const periodEndStr = formatLocalYMD(pe);

  const lines: string[] = [
    "store_id,upc,product_description,units_sold,period_start,period_end",
  ];
  for (const r of rows) {
    if (r.netUnits === 0) continue;
    lines.push(
      [
        csvEscape(r.storeId),
        csvEscape(r.upc),
        csvEscape(r.productName),
        String(r.netUnits),
        periodStartStr,
        periodEndStr,
      ].join(","),
    );
  }

  const byStore = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byStore.has(r.storeId)) byStore.set(r.storeId, []);
    byStore.get(r.storeId)!.push(r);
  }

  if (createSubmissions) {
    for (const s of stores) {
      const storeRows = byStore.get(s.id) ?? [];
      const { units, retail } = sumTotals(storeRows);
      const rebate = totalRebateForProgram(program.rebateType, program.rebateValue, units, retail);

      await prisma.scanDataSubmission.upsert({
        where: {
          storeId_programId_reportingPeriodStart_reportingPeriodEnd: {
            storeId: s.id,
            programId: program.id,
            reportingPeriodStart: ps,
            reportingPeriodEnd: pe,
          },
        },
        create: {
          storeId: s.id,
          programId: program.id,
          reportingPeriodStart: ps,
          reportingPeriodEnd: pe,
          totalQualifyingUnitsSold: units,
          totalRebateValueCalculated: rebate,
          status: "pending",
          fileFormat: d.fileFormat,
          submittedById: auth.user.id,
        },
        update: {
          totalQualifyingUnitsSold: units,
          totalRebateValueCalculated: rebate,
          fileFormat: d.fileFormat,
          submittedById: auth.user.id,
        },
      });
    }
  }

  const csv = lines.join("\r\n");
  const filename = `scan-data-${program.programName.replace(/[^a-z0-9_-]+/gi, "_")}-${periodStartStr}_${periodEndStr}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
