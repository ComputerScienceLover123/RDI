function escCell(v: string | number): string {
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

import type { HqReportPayload } from "@/lib/reports/types";

export function renderReportCsv(payload: HqReportPayload, meta: { generatedAt: Date; rangeLabel: string }): string {
  const lines: string[] = [];
  lines.push(`Company report: ${payload.title}`);
  lines.push(`Period: ${meta.rangeLabel}`);
  lines.push(`Generated: ${meta.generatedAt.toISOString()}`);
  lines.push("");

  for (const t of payload.tables) {
    lines.push(`## ${t.title}`);
    lines.push(t.columns.map(escCell).join(","));
    for (const row of t.rows) {
      lines.push(row.map(escCell).join(","));
    }
    lines.push("");
  }

  return lines.join("\r\n");
}

export function defaultRangeLabel(fromStr: string, toStr: string): string {
  return `${fromStr} to ${toStr}`;
}
