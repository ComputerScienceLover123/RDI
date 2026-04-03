import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import type { HqReportType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildHqReportData } from "@/lib/reports/buildReportData";
import { renderReportCsv } from "@/lib/reports/csvExport";
import { renderReportPdf } from "@/lib/reports/pdfExport";
import { defaultRangeLabel } from "@/lib/reports/csvExport";
import { startOfLocalDay } from "@/lib/sales/dates";

export const HQ_REPORT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export async function generateAndSaveHqReport(input: {
  reportType: HqReportType;
  storeIds: string[];
  range: { from: Date; to: Date; fromStr: string; toStr: string };
  generatedById: string;
  displayName?: string;
}): Promise<{ id: string } | { error: string }> {
  const built = await buildHqReportData(input.reportType, input.storeIds, input.range);
  if ("error" in built) return { error: built.error };

  const company = process.env.COMPANY_NAME || "RDI";
  const generatedAt = new Date();
  const rangeLabel = defaultRangeLabel(input.range.fromStr, input.range.toStr);

  const csv = renderReportCsv(built, { generatedAt, rangeLabel });
  const pdf = await renderReportPdf(built, { company, generatedAt, rangeLabel });

  const id = randomUUID();
  const relDir = path.join("data", "hq-reports");
  const absDir = path.join(process.cwd(), relDir);
  await fs.mkdir(absDir, { recursive: true });
  const csvRel = path.join(relDir, `${id}.csv`);
  const pdfRel = path.join(relDir, `${id}.pdf`);
  await fs.writeFile(path.join(process.cwd(), csvRel), csv, "utf8");
  await fs.writeFile(path.join(process.cwd(), pdfRel), pdf);

  const title = input.displayName?.trim() || built.title;

  await prisma.hqGeneratedReport.create({
    data: {
      id,
      displayName: title,
      reportType: input.reportType,
      dateFrom: startOfLocalDay(input.range.from),
      dateTo: startOfLocalDay(input.range.to),
      storeScopeJson: { storeIds: input.storeIds } as object,
      generatedById: input.generatedById,
      csvRelPath: csvRel.replace(/\\/g, "/"),
      pdfRelPath: pdfRel.replace(/\\/g, "/"),
      expiresAt: new Date(Date.now() + HQ_REPORT_RETENTION_MS),
    },
  });

  return { id };
}

export async function cleanupExpiredHqReports(): Promise<{ deleted: number }> {
  const old = await prisma.hqGeneratedReport.findMany({
    where: { expiresAt: { lt: new Date() } },
  });
  let deleted = 0;
  for (const r of old) {
    try {
      await fs.unlink(path.join(process.cwd(), r.csvRelPath)).catch(() => null);
      await fs.unlink(path.join(process.cwd(), r.pdfRelPath)).catch(() => null);
    } catch {
      /* ignore */
    }
    await prisma.hqGeneratedReport.delete({ where: { id: r.id } });
    deleted++;
  }
  return { deleted };
}
