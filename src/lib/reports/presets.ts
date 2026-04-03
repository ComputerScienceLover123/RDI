import type { HqReportDatePreset } from "@prisma/client";
import { endOfLocalDay, formatLocalYMD, parseLocalYMD, startOfLocalDay } from "@/lib/sales/dates";

export type ResolvedRange = { from: Date; to: Date; fromStr: string; toStr: string };

export function resolveDatePreset(
  preset: HqReportDatePreset,
  customFrom: Date | null | undefined,
  customTo: Date | null | undefined,
  now: Date = new Date(),
): ResolvedRange | { error: string } {
  const today = startOfLocalDay(now);

  if (preset === "custom_range") {
    if (!customFrom || !customTo) return { error: "custom_range requires customDateFrom and customDateTo" };
    const from = startOfLocalDay(customFrom);
    const to = endOfLocalDay(customTo);
    if (from.getTime() > to.getTime()) return { error: "Invalid custom range" };
    return { from, to, fromStr: formatLocalYMD(from), toStr: formatLocalYMD(customTo) };
  }

  if (preset === "last_7_days") {
    const to = endOfLocalDay(today);
    const from = startOfLocalDay(new Date(today));
    from.setDate(from.getDate() - 6);
    return { from, to, fromStr: formatLocalYMD(from), toStr: formatLocalYMD(today) };
  }

  if (preset === "last_30_days") {
    const to = endOfLocalDay(today);
    const from = startOfLocalDay(new Date(today));
    from.setDate(from.getDate() - 29);
    return { from, to, fromStr: formatLocalYMD(from), toStr: formatLocalYMD(today) };
  }

  if (preset === "last_month") {
    const firstThis = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastPrev = new Date(firstThis);
    lastPrev.setDate(0);
    const firstPrev = new Date(lastPrev.getFullYear(), lastPrev.getMonth(), 1);
    return {
      from: startOfLocalDay(firstPrev),
      to: endOfLocalDay(lastPrev),
      fromStr: formatLocalYMD(firstPrev),
      toStr: formatLocalYMD(lastPrev),
    };
  }

  if (preset === "last_quarter") {
    const m = today.getMonth();
    const q = Math.floor(m / 3);
    let year = today.getFullYear();
    let startMonth: number;
    if (q === 0) {
      year -= 1;
      startMonth = 9;
    } else {
      startMonth = (q - 1) * 3;
    }
    const first = new Date(year, startMonth, 1);
    const last = new Date(year, startMonth + 3, 0);
    return {
      from: startOfLocalDay(first),
      to: endOfLocalDay(last),
      fromStr: formatLocalYMD(first),
      toStr: formatLocalYMD(last),
    };
  }

  return { error: "Unknown preset" };
}

export function parseYmdOrNull(s: string | null | undefined): Date | null {
  if (!s?.trim()) return null;
  return parseLocalYMD(s.trim());
}
