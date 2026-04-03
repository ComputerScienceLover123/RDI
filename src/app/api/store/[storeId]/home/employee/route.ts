import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAccessStore } from "@/lib/store/storeAccess";
import { notificationsWhereForInbox } from "@/lib/alerts/visibility";
import { formatLocalYMD } from "@/lib/sales/dates";
import { utcNoonFromYmd } from "@/lib/fuel/dates";
import { canViewSchedule } from "@/lib/store/scheduleAccess";

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
  if (user.role !== "employee") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!canViewSchedule(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const ymd = formatLocalYMD(new Date());
  const todayDate = utcNoonFromYmd(ymd);

  const [shiftsToday, myUpcoming, notifs] = await Promise.all([
    prisma.shift.findMany({
      where: { storeId, shiftDate: todayDate },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: [{ startMinutes: "asc" }],
    }),
    prisma.shift.findMany({
      where: {
        employeeId: user.id,
        shiftDate: { gte: todayDate },
      },
      orderBy: [{ shiftDate: "asc" }, { startMinutes: "asc" }],
      take: 12,
      include: { store: { select: { name: true } } },
    }),
    prisma.notification.findMany({
      where: notificationsWhereForInbox(user),
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        description: true,
        linkUrl: true,
        read: true,
        createdAt: true,
      },
    }),
  ]);

  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const workingNow: { name: string; until: string }[] = [];
  for (const s of shiftsToday) {
    if (s.endMinutes <= s.startMinutes) continue;
    const name = `${s.employee.firstName} ${s.employee.lastName}`;
    if (s.startMinutes <= nowMins && nowMins < s.endMinutes) {
      workingNow.push({ name, until: fmtMins(s.endMinutes) });
    }
  }
  const laterToday = shiftsToday
    .filter((s) => s.endMinutes > s.startMinutes && s.startMinutes > nowMins)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  const nextUp =
    laterToday[0] ?
      {
        name: `${laterToday[0]!.employee.firstName} ${laterToday[0]!.employee.lastName}`,
        startsAt: fmtMins(laterToday[0]!.startMinutes),
      }
    : null;

  let totalScheduledMinutes = 0;
  const ids = new Set<string>();
  for (const s of shiftsToday) {
    if (s.endMinutes > s.startMinutes) {
      totalScheduledMinutes += s.endMinutes - s.startMinutes;
      ids.add(s.employeeId);
    }
  }

  return NextResponse.json({
    dateYmd: ymd,
    scheduleSnapshot: {
      workingNow,
      nextUp,
      scheduledStaffCount: ids.size,
      scheduledHoursToday: Math.round((totalScheduledMinutes / 60) * 10) / 10,
    },
    myUpcomingShifts: myUpcoming.map((s) => ({
      id: s.id,
      shiftDate: s.shiftDate.toISOString().slice(0, 10),
      label: `${fmtMins(s.startMinutes)} – ${fmtMins(s.endMinutes)}`,
      storeName: s.store.name,
    })),
    infoNotifications: notifs.map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}
