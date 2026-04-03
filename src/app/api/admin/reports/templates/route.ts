import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HqReportDatePreset, HqReportStoreScope, HqReportType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { parseYmdOrNull } from "@/lib/reports/presets";
import { resolveStoreIds } from "@/lib/reports/resolveStores";

export const runtime = "nodejs";

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  reportType: z.nativeEnum(HqReportType),
  storeScope: z.nativeEnum(HqReportStoreScope),
  storeIds: z.array(z.string()).optional(),
  datePreset: z.nativeEnum(HqReportDatePreset),
  customDateFrom: z.string().optional(),
  customDateTo: z.string().optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const rows = await prisma.hqReportTemplate.findMany({
    orderBy: { updatedAt: "desc" },
    include: { schedules: true },
  });

  return NextResponse.json({
    templates: rows.map((t) => ({
      id: t.id,
      name: t.name,
      reportType: t.reportType,
      storeScope: t.storeScope,
      storeIds: t.storeIds,
      datePreset: t.datePreset,
      customDateFrom: t.customDateFrom?.toISOString().slice(0, 10) ?? null,
      customDateTo: t.customDateTo?.toISOString().slice(0, 10) ?? null,
      schedules: t.schedules.map((s) => ({
        id: s.id,
        frequency: s.frequency,
        enabled: s.enabled,
        lastRunAt: s.lastRunAt?.toISOString() ?? null,
      })),
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const d = parsed.data;

  const stores = await resolveStoreIds(d.storeScope, d.storeIds ?? []);
  if ("error" in stores) return NextResponse.json({ error: stores.error }, { status: 400 });

  const t = await prisma.hqReportTemplate.create({
    data: {
      name: d.name,
      reportType: d.reportType,
      storeScope: d.storeScope,
      storeIds: d.storeIds ?? [],
      datePreset: d.datePreset,
      customDateFrom: parseYmdOrNull(d.customDateFrom ?? undefined),
      customDateTo: parseYmdOrNull(d.customDateTo ?? undefined),
      createdById: auth.user.id,
    },
  });

  return NextResponse.json({ id: t.id });
}
