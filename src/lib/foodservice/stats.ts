import { prisma } from "@/lib/prisma";
import { endOfLocalDay, formatLocalYMD, startOfLocalDay } from "@/lib/sales/dates";

export async function soldUnitsByMenuItemOnDate(
  storeId: string,
  day: Date,
): Promise<Map<string, number>> {
  const start = startOfLocalDay(day);
  const end = endOfLocalDay(day);
  const rows = await prisma.foodserviceHotCaseEntry.groupBy({
    by: ["menuItemId"],
    where: {
      storeId,
      status: "sold",
      disposedAt: { gte: start, lte: end },
    },
    _sum: { quantityPlaced: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.menuItemId, r._sum.quantityPlaced ?? 0);
  }
  return m;
}

export async function wasteUnitsByMenuItemOnDate(
  storeId: string,
  day: Date,
): Promise<Map<string, number>> {
  const start = startOfLocalDay(day);
  const end = endOfLocalDay(day);
  const rows = await prisma.foodserviceWasteLog.groupBy({
    by: ["menuItemId"],
    where: {
      storeId,
      createdAt: { gte: start, lte: end },
    },
    _sum: { quantity: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) {
    m.set(r.menuItemId, r._sum.quantity ?? 0);
  }
  return m;
}

/** Average sold units on the same weekday for each of the past `weeks` weeks (weeks 1..weeks ago). */
export async function avgSoldSameWeekday(
  storeId: string,
  menuItemId: string,
  weeks: number,
  fromDate: Date,
): Promise<number> {
  let total = 0;
  for (let w = 1; w <= weeks; w++) {
    const d = new Date(fromDate);
    d.setDate(d.getDate() - 7 * w);
    const m = await soldUnitsByMenuItemOnDate(storeId, d);
    total += m.get(menuItemId) ?? 0;
  }
  return weeks > 0 ? total / weeks : 0;
}

export function addDaysLocal(d: Date, delta: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + delta);
  return x;
}

export function formatDayLabel(d: Date): string {
  return formatLocalYMD(d);
}
