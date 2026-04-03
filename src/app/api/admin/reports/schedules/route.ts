import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HqReportScheduleFrequency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";

export const runtime = "nodejs";

const Schema = z.object({
  templateId: z.string().min(1),
  frequency: z.nativeEnum(HqReportScheduleFrequency),
  enabled: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const t = await prisma.hqReportTemplate.findUnique({ where: { id: parsed.data.templateId } });
  if (!t) return NextResponse.json({ error: "Template not found" }, { status: 404 });

  const s = await prisma.hqReportSchedule.create({
    data: {
      templateId: parsed.data.templateId,
      frequency: parsed.data.frequency,
      enabled: parsed.data.enabled ?? true,
    },
  });

  return NextResponse.json({ id: s.id });
}
