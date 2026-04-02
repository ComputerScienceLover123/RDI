import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canEditSchedule } from "@/lib/store/scheduleAccess";
import { mondayOfWeekContaining, utcDateFromYmd, weekDayYmds, ymdFromUtcDate } from "@/lib/store/weekDates";
import { shiftHoursDecimal, validateShiftDuration } from "@/lib/store/shiftTime";

export const runtime = "nodejs";

const createBody = z.object({
  employeeId: z.string().min(1),
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMinutes: z.number().int(),
  endMinutes: z.number().int(),
  templateName: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

async function employeeAtStore(employeeId: string, storeId: string) {
  const u = await prisma.user.findFirst({
    where: { id: employeeId, assignedStoreId: storeId, accountStatus: "active" },
  });
  return !!u;
}

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canEditSchedule(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = createBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { employeeId, shiftDate, startMinutes, endMinutes, templateName, notes } = parsed.data;
  const v = validateShiftDuration(startMinutes, endMinutes);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  if (!(await employeeAtStore(employeeId, storeId))) {
    return NextResponse.json({ error: "Employee is not assigned to this store" }, { status: 400 });
  }

  const date = utcDateFromYmd(shiftDate);
  try {
    const shift = await prisma.shift.create({
      data: {
        storeId,
        employeeId,
        shiftDate: date,
        startMinutes,
        endMinutes,
        templateName: templateName?.trim() || null,
        notes: notes?.trim() || null,
        createdById: user.id,
      },
    });
    const weekStart = mondayOfWeekContaining(shiftDate);
    const days = weekDayYmds(weekStart);
    const startD = utcDateFromYmd(days[0]!);
    const endD = utcDateFromYmd(days[6]!);
    const weekShifts = await prisma.shift.findMany({
      where: { storeId, employeeId, shiftDate: { gte: startD, lte: endD } },
    });
    let totalHrs = 0;
    for (const s of weekShifts) totalHrs += shiftHoursDecimal(s.startMinutes, s.endMinutes);

    return NextResponse.json({
      shift: {
        id: shift.id,
        employeeId: shift.employeeId,
        shiftDate: ymdFromUtcDate(shift.shiftDate),
        startMinutes: shift.startMinutes,
        endMinutes: shift.endMinutes,
        templateName: shift.templateName,
        notes: shift.notes,
      },
      weeklyHoursAfter: Math.round(totalHrs * 100) / 100,
    });
  } catch (e: unknown) {
    const code = typeof e === "object" && e && "code" in e ? (e as { code?: string }).code : "";
    if (code === "P2002") {
      return NextResponse.json({ error: "This employee already has a shift on that day" }, { status: 409 });
    }
    throw e;
  }
}
