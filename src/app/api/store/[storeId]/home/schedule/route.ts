import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAccessStore } from "@/lib/store/storeAccess";
import { canViewSchedule } from "@/lib/store/scheduleAccess";
import { formatLocalYMD } from "@/lib/sales/dates";
import { utcNoonFromYmd } from "@/lib/fuel/dates";

export const runtime = "nodejs";

function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canAccessStore(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canViewSchedule(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ymd = formatLocalYMD(new Date());
  const todayDate = utcNoonFromYmd(ymd);

  const shifts = await prisma.shift.findMany({
    where: { storeId, shiftDate: todayDate },
    include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: [{ startMinutes: "asc" }, { employeeId: "asc" }],
  });

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const workingNow: { name: string; until: string }[] = [];
  for (const s of shifts) {
    if (s.endMinutes <= s.startMinutes) continue;
    const name = `${s.employee.firstName} ${s.employee.lastName}`;
    if (s.startMinutes <= nowMins && nowMins < s.endMinutes) {
      workingNow.push({ name, until: fmtMins(s.endMinutes) });
    }
  }

  const laterToday = shifts
    .filter((s) => s.endMinutes > s.startMinutes && s.startMinutes > nowMins)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const nextShift =
    laterToday[0] ?
      {
        name: `${laterToday[0]!.employee.firstName} ${laterToday[0]!.employee.lastName}`,
        startsAt: fmtMins(laterToday[0]!.startMinutes),
      }
    : null;

  let totalScheduledMinutes = 0;
  const ids = new Set<string>();
  for (const s of shifts) {
    if (s.endMinutes > s.startMinutes) {
      totalScheduledMinutes += s.endMinutes - s.startMinutes;
      ids.add(s.employeeId);
    }
  }

  return NextResponse.json({
    dateYmd: ymd,
    workingNow,
    nextUp: nextShift,
    scheduledStaffCount: ids.size,
    scheduledHoursToday: Math.round((totalScheduledMinutes / 60) * 10) / 10,
  });
}
