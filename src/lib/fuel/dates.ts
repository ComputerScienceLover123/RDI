import { formatLocalYMD, startOfLocalDay } from "@/lib/sales/dates";

/** Calendar YYYY-MM-DD as UTC noon for consistent @db.Date storage. */
export function utcNoonFromYmd(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) throw new Error("Invalid YYYY-MM-DD");
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0));
}

export function ymdFromDbDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addLocalDaysFromYmd(ymd: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) throw new Error("Invalid YYYY-MM-DD");
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  dt.setDate(dt.getDate() + delta);
  return formatLocalYMD(dt);
}

export function lastNDatesLocal(n: number): string[] {
  const today = startOfLocalDay(new Date());
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(formatLocalYMD(d));
  }
  return out;
}
