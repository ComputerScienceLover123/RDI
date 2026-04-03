import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HqReportType, HqReportStoreScope } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { generateAndSaveHqReport } from "@/lib/reports/generateAndSave";
import { resolveStoreIds } from "@/lib/reports/resolveStores";
import { endOfLocalDay, parseLocalYMD, startOfLocalDay } from "@/lib/sales/dates";

export const runtime = "nodejs";

const BodySchema = z.object({
  reportType: z.nativeEnum(HqReportType),
  storeScope: z.nativeEnum(HqReportStoreScope),
  storeIds: z.array(z.string()).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  displayName: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const d = parsed.data;

  const fromD = parseLocalYMD(d.from);
  const toD = parseLocalYMD(d.to);
  if (!fromD || !toD || fromD.getTime() > toD.getTime()) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const stores = await resolveStoreIds(d.storeScope, d.storeIds ?? []);
  if ("error" in stores) return NextResponse.json({ error: stores.error }, { status: 400 });

  const range = {
    from: startOfLocalDay(fromD),
    to: endOfLocalDay(toD),
    fromStr: d.from,
    toStr: d.to,
  };

  const result = await generateAndSaveHqReport({
    reportType: d.reportType,
    storeIds: stores,
    range,
    generatedById: auth.user.id,
    displayName: d.displayName,
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ id: result.id });
}
