import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HqReportScheduleFrequency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";

export const runtime = "nodejs";

const PatchSchema = z
  .object({
    frequency: z.nativeEnum(HqReportScheduleFrequency).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

export async function PATCH(req: NextRequest, { params }: { params: { scheduleId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  await prisma.hqReportSchedule.update({
    where: { id: params.scheduleId },
    data: parsed.data,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { scheduleId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  await prisma.hqReportSchedule.delete({ where: { id: params.scheduleId } });
  return NextResponse.json({ ok: true });
}
