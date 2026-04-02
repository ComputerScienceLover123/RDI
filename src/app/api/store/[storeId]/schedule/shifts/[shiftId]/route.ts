import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canEditSchedule } from "@/lib/store/scheduleAccess";
import { mondayOfWeekContaining, utcDateFromYmd, weekDayYmds, ymdFromUtcDate } from "@/lib/store/weekDates";
import { shiftHoursDecimal, validateShiftDuration } from "@/lib/store/shiftTime";

export const runtime = "nodejs";

const patchBody = z.object({
  startMinutes: z.number().int().optional(),
  endMinutes: z.number().int().optional(),
  templateName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { storeId: string; shiftId: string } },
) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { storeId, shiftId } = params;
  if (!canEditSchedule(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.shift.findFirst({ where: { id: shiftId, storeId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const startMinutes = parsed.data.startMinutes ?? existing.startMinutes;
  const endMinutes = parsed.data.endMinutes ?? existing.endMinutes;
  const v = validateShiftDuration(startMinutes, endMinutes);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const shift = await prisma.shift.update({
    where: { id: shiftId },
    data: {
      startMinutes,
      endMinutes,
      ...(parsed.data.templateName !== undefined ? { templateName: parsed.data.templateName?.trim() || null } : {}),
      ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes?.trim() || null } : {}),
    },
  });

  const ymd = ymdFromUtcDate(shift.shiftDate);
  const weekStart = mondayOfWeekContaining(ymd);
  const days = weekDayYmds(weekStart);
  const startD = utcDateFromYmd(days[0]!);
  const endD = utcDateFromYmd(days[6]!);
  const weekShifts = await prisma.shift.findMany({
    where: { storeId, employeeId: shift.employeeId, shiftDate: { gte: startD, lte: endD } },
  });
  let totalHrs = 0;
  for (const s of weekShifts) totalHrs += shiftHoursDecimal(s.startMinutes, s.endMinutes);

  return NextResponse.json({
    shift: {
      id: shift.id,
      employeeId: shift.employeeId,
      shiftDate: ymd,
      startMinutes: shift.startMinutes,
      endMinutes: shift.endMinutes,
      templateName: shift.templateName,
      notes: shift.notes,
    },
    weeklyHoursAfter: Math.round(totalHrs * 100) / 100,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { storeId: string; shiftId: string } },
) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { storeId, shiftId } = params;
  if (!canEditSchedule(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.shift.findFirst({ where: { id: shiftId, storeId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.shift.delete({ where: { id: shiftId } });
  return NextResponse.json({ ok: true });
}
