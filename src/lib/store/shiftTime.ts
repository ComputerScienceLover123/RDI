import { addDaysYmd } from "@/lib/store/weekDates";

export function shiftDurationMinutes(startMinutes: number, endMinutes: number): number {
  if (startMinutes === endMinutes) return 0;
  if (endMinutes > startMinutes) return endMinutes - startMinutes;
  return 24 * 60 - startMinutes + endMinutes;
}

export function shiftHoursDecimal(startMinutes: number, endMinutes: number): number {
  return shiftDurationMinutes(startMinutes, endMinutes) / 60;
}

export type ShiftKind = "morning" | "afternoon" | "night";

export function classifyShiftKind(startMinutes: number, endMinutes: number): ShiftKind {
  const overnight = endMinutes < startMinutes;
  if (overnight) return "night";
  if (startMinutes < 12 * 60) return "morning";
  if (startMinutes < 17 * 60) return "afternoon";
  return "night";
}

export function minutesFromTimeInput(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

export function formatMinutesAsTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function validateShiftDuration(
  startMinutes: number,
  endMinutes: number,
): { ok: true } | { ok: false; error: string } {
  if (
    !Number.isInteger(startMinutes) ||
    !Number.isInteger(endMinutes) ||
    startMinutes < 0 ||
    startMinutes > 1439 ||
    endMinutes < 0 ||
    endMinutes > 1439
  ) {
    return { ok: false, error: "Invalid time range" };
  }
  const dur = shiftDurationMinutes(startMinutes, endMinutes);
  if (dur <= 0) return { ok: false, error: "Shift must have positive length" };
  if (dur > 24 * 60) return { ok: false, error: "Shift cannot exceed 24 hours" };
  return { ok: true };
}

/** Timeline segments visible on a given calendar day (handles overnight spill). */
export type DaySegment = { fromMin: number; toMin: number };

export function segmentsForCalendarDay(
  shiftDateYmd: string,
  startMinutes: number,
  endMinutes: number,
  dayYmd: string,
): DaySegment[] {
  if (shiftDateYmd === dayYmd) {
    if (endMinutes > startMinutes) return [{ fromMin: startMinutes, toMin: endMinutes }];
    if (endMinutes < startMinutes) return [{ fromMin: startMinutes, toMin: 24 * 60 }];
    return [];
  }
  const prev = addDaysYmd(dayYmd, -1);
  if (shiftDateYmd === prev && endMinutes < startMinutes) {
    return [{ fromMin: 0, toMin: endMinutes }];
  }
  return [];
}
