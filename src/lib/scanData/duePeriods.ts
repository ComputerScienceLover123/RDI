import { formatLocalYMD, startOfLocalDay } from "@/lib/sales/dates";
import type { ScanDataPaymentFrequency } from "@prisma/client";

export type DuePeriod = { periodKey: string; label: string; periodStart: Date; periodEnd: Date };

/** If today is a reporting due date for the frequency, return the period that was just completed. */
export function completedPeriodIfDueToday(
  frequency: ScanDataPaymentFrequency,
  now: Date = new Date(),
): DuePeriod | null {
  const d = startOfLocalDay(now);

  if (frequency === "monthly") {
    if (d.getDate() !== 1) return null;
    const end = new Date(d.getFullYear(), d.getMonth(), 0);
    const start = new Date(end.getFullYear(), end.getMonth(), 1);
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    return {
      periodKey: `m:${key}`,
      label: formatLocalYMD(start).slice(0, 7),
      periodStart: start,
      periodEnd: end,
    };
  }

  if (frequency === "weekly") {
    if (d.getDay() !== 1) return null;
    const end = new Date(d);
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const key = `${formatLocalYMD(start)}_${formatLocalYMD(end)}`;
    return {
      periodKey: `w:${key}`,
      label: `${formatLocalYMD(start)} → ${formatLocalYMD(end)}`,
      periodStart: start,
      periodEnd: end,
    };
  }

  if (frequency === "quarterly") {
    const m = d.getMonth();
    const day = d.getDate();
    if (day !== 1 || ![0, 3, 6, 9].includes(m)) return null;
    const end = new Date(d);
    end.setDate(end.getDate() - 1);
    const start = new Date(end.getFullYear(), end.getMonth() - 2, 1);
    const key = `${start.getFullYear()}-Q${Math.floor(start.getMonth() / 3) + 1}`;
    return {
      periodKey: `q:${key}`,
      label: key,
      periodStart: start,
      periodEnd: end,
    };
  }

  return null;
}
