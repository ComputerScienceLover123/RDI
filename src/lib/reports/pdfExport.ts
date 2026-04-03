import PDFDocument from "pdfkit";
import type { HqReportPayload } from "@/lib/reports/types";

export function renderReportPdf(
  payload: HqReportPayload,
  meta: { company: string; generatedAt: Date; rangeLabel: string },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(16).text(meta.company, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(13).text(payload.title, { align: "center" });
    doc.font("Helvetica").fontSize(10);
    doc.moveDown(0.3);
    doc.text(`Period: ${meta.rangeLabel}`, { align: "center" });
    doc.text(`Generated: ${meta.generatedAt.toLocaleString()}`, { align: "center" });
    doc.moveDown(1);

    for (const table of payload.tables) {
      doc.font("Helvetica-Bold").fontSize(11).text(table.title);
      doc.moveDown(0.25);
      doc.font("Helvetica").fontSize(9);
      const header = table.columns.join("  |  ");
      doc.text(header, { width: 500 });
      doc.moveDown(0.15);
      for (const row of table.rows) {
        const line = row.map(String).join("  |  ");
        doc.text(line, { width: 500 });
        doc.moveDown(0.12);
      }
      doc.moveDown(0.6);
    }

    doc.end();
  });
}
