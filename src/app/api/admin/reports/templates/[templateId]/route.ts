import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { HqReportDatePreset, HqReportStoreScope, HqReportType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { resolveDatePreset } from "@/lib/reports/presets";
import { parseYmdOrNull } from "@/lib/reports/presets";
import { resolveStoreIds } from "@/lib/reports/resolveStores";
import { generateAndSaveHqReport } from "@/lib/reports/generateAndSave";

export const runtime = "nodejs";

const PatchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    reportType: z.nativeEnum(HqReportType).optional(),
    storeScope: z.nativeEnum(HqReportStoreScope).optional(),
    storeIds: z.array(z.string()).optional(),
    datePreset: z.nativeEnum(HqReportDatePreset).optional(),
    customDateFrom: z.string().nullable().optional(),
    customDateTo: z.string().nullable().optional(),
  })
  .strict();

export async function PATCH(req: NextRequest, { params }: { params: { templateId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const d = parsed.data;

  const data: Prisma.HqReportTemplateUpdateInput = {};
  if (d.name != null) data.name = d.name;
  if (d.reportType != null) data.reportType = d.reportType;
  if (d.storeScope != null) data.storeScope = d.storeScope;
  if (d.storeIds != null) data.storeIds = d.storeIds;
  if (d.datePreset != null) data.datePreset = d.datePreset;
  if (d.customDateFrom !== undefined) {
    data.customDateFrom = d.customDateFrom ? parseYmdOrNull(d.customDateFrom) : null;
  }
  if (d.customDateTo !== undefined) {
    data.customDateTo = d.customDateTo ? parseYmdOrNull(d.customDateTo) : null;
  }

  await prisma.hqReportTemplate.update({
    where: { id: params.templateId },
    data,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { templateId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  await prisma.hqReportTemplate.delete({ where: { id: params.templateId } });
  return NextResponse.json({ ok: true });
}

/** Run template now with rolling date resolution. */
export async function POST(_req: NextRequest, { params }: { params: { templateId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const t = await prisma.hqReportTemplate.findUnique({ where: { id: params.templateId } });
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const range = resolveDatePreset(t.datePreset, t.customDateFrom ?? undefined, t.customDateTo ?? undefined);
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });

  const stores = await resolveStoreIds(t.storeScope, t.storeIds);
  if ("error" in stores) return NextResponse.json({ error: stores.error }, { status: 400 });

  const result = await generateAndSaveHqReport({
    reportType: t.reportType,
    storeIds: stores,
    range,
    generatedById: auth.user.id,
    displayName: t.name,
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  return NextResponse.json({ id: result.id });
}
