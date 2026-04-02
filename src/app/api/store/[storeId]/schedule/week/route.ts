import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canEditSchedule, canViewSchedule } from "@/lib/store/scheduleAccess";
import {
  mondayOfWeekContaining,
  utcDateFromYmd,
  weekDayYmds,
  ymdFromUtcDate,
} from "@/lib/store/weekDates";
import { classifyShiftKind, shiftHoursDecimal } from "@/lib/store/shiftTime";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canViewSchedule(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const raw = req.nextUrl.searchParams.get("weekStart")?.trim();
  const todayYmd = ymdFromUtcDate(new Date());
  const monday = raw ? mondayOfWeekContaining(raw) : mondayOfWeekContaining(todayYmd);
  const days = weekDayYmds(monday);
  const startD = utcDateFromYmd(days[0]!);
  const endD = utcDateFromYmd(days[6]!);

  const [employees, shifts, templates] = await Promise.all([
    prisma.user.findMany({
      where: { assignedStoreId: storeId, accountStatus: "active" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, role: true },
    }),
    prisma.shift.findMany({
      where: { storeId, shiftDate: { gte: startD, lte: endD } },
      orderBy: [{ employeeId: "asc" }, { shiftDate: "asc" }],
    }),
    canEditSchedule(user, storeId)
      ? prisma.shiftTemplate.findMany({
          where: { storeId },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  const weeklyHours: Record<string, number> = {};
  for (const e of employees) weeklyHours[e.id] = 0;
  const shiftPayload = shifts.map((s) => {
    const ymd = ymdFromUtcDate(s.shiftDate);
    const hrs = shiftHoursDecimal(s.startMinutes, s.endMinutes);
    weeklyHours[s.employeeId] = (weeklyHours[s.employeeId] ?? 0) + hrs;
    return {
      id: s.id,
      employeeId: s.employeeId,
      shiftDate: ymd,
      startMinutes: s.startMinutes,
      endMinutes: s.endMinutes,
      templateName: s.templateName,
      notes: s.notes,
      hours: Math.round(hrs * 100) / 100,
      kind: classifyShiftKind(s.startMinutes, s.endMinutes),
    };
  });

  return NextResponse.json({
    storeId,
    weekStart: monday,
    days,
    employees,
    shifts: shiftPayload,
    weeklyHours,
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      startMinutes: t.startMinutes,
      endMinutes: t.endMinutes,
    })),
    canEdit: canEditSchedule(user, storeId),
  });
}
