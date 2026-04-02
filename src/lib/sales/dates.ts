/** Calendar boundaries in the server's local timezone. */
export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function endOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function formatLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseLocalYMD(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const day = Number(m[3]);
  const d = new Date(y, mo, day);
  if (d.getFullYear() !== y || d.getMonth() !== mo || d.getDate() !== day) return null;
  return startOfLocalDay(d);
}

export function defaultChartRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: formatLocalYMD(from), to: formatLocalYMD(to) };
}

export function parseRangeQuery(
  fromParam: string | null,
  toParam: string | null
): { from: Date; to: Date; fromStr: string; toStr: string } | { error: string } {
  const def = defaultChartRange();
  const fromStr = fromParam?.trim() || def.from;
  const toStr = toParam?.trim() || def.to;
  const fromD = parseLocalYMD(fromStr);
  const toD = parseLocalYMD(toStr);
  if (!fromD || !toD) return { error: "Invalid date range" };
  if (fromD.getTime() > toD.getTime()) return { error: "from must be before to" };
  return { from: fromD, to: endOfLocalDay(toD), fromStr, toStr };
}
