import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canEditSchedule } from "@/lib/store/scheduleAccess";
import {
  addDaysYmd,
  mondayOfWeekContaining,
  utcDateFromYmd,
  weekDayYmds,
  ymdFromUtcDate,
} from "@/lib/store/weekDates";

export const runtime = "nodejs";

const bodySchema = z.object({
  targetWeekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canEditSchedule(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const targetMonday = mondayOfWeekContaining(parsed.data.targetWeekStart);
  const sourceMonday = addDaysYmd(targetMonday, -7);
  const sourceDays = weekDayYmds(sourceMonday);
  const targetDays = weekDayYmds(targetMonday);

  const sourceDates = sourceDays.map(utcDateFromYmd);
  const targetDates = targetDays.map(utcDateFromYmd);

  const sourceShifts = await prisma.shift.findMany({
    where: { storeId, shiftDate: { in: sourceDates } },
  });

  const created = await prisma.$transaction(async (tx) => {
    await tx.shift.deleteMany({
      where: { storeId, shiftDate: { in: targetDates } },
    });
    const empIds = [...new Set(sourceShifts.map((s) => s.employeeId))];
    const stillHere = await tx.user.findMany({
      where: { id: { in: empIds }, assignedStoreId: storeId, accountStatus: "active" },
      select: { id: true },
    });
    const ok = new Set(stillHere.map((u) => u.id));
    let n = 0;
    for (const s of sourceShifts) {
      if (!ok.has(s.employeeId)) continue;
      const srcYmd = ymdFromUtcDate(s.shiftDate);
      const idx = sourceDays.indexOf(srcYmd);
      if (idx < 0 || idx >= targetDays.length) continue;
      const newYmd = targetDays[idx]!;
      await tx.shift.create({
        data: {
          storeId,
          employeeId: s.employeeId,
          shiftDate: utcDateFromYmd(newYmd),
          startMinutes: s.startMinutes,
          endMinutes: s.endMinutes,
          templateName: s.templateName,
          notes: s.notes,
          createdById: user.id,
        },
      });
      n += 1;
    }
    return n;
  });

  return NextResponse.json({ ok: true, copiedShifts: created, targetWeekStart: targetMonday });
}
