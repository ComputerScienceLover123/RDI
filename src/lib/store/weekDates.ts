/** Parse YYYY-MM-DD as UTC calendar components (date-only, no timezone shift). */
export function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) throw new Error("Invalid YYYY-MM-DD");
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function utcDateFromYmd(ymd: string): Date {
  const { y, m, d } = parseYmd(ymd);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
}

export function ymdFromUtcDate(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

/** Monday (ISO) as YYYY-MM-DD for the UTC week containing `ymd`. */
export function mondayOfWeekContaining(ymd: string): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay();
  const toMonday = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + toMonday);
  return ymdFromUtcDate(dt);
}

export function addDaysYmd(ymd: string, delta: number): string {
  const { y, m, d } = parseYmd(ymd);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return ymdFromUtcDate(dt);
}

export function weekDayYmds(mondayYmd: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(addDaysYmd(mondayYmd, i));
  return out;
}
