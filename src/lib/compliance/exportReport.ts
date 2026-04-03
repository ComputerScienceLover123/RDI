import PDFDocument from "pdfkit";

export function complianceOverviewToCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}

export function renderCompliancePdf(opts: {
  title: string;
  company: string;
  rangeLabel: string;
  tables: { title: string; columns: string[]; rows: string[][] }[];
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Helvetica-Bold").fontSize(16).text(opts.company, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(13).text(opts.title, { align: "center" });
    doc.font("Helvetica").fontSize(10);
    doc.moveDown(0.3);
    doc.text(`Period: ${opts.rangeLabel}`, { align: "center" });
    doc.text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });
    doc.moveDown(1);

    for (const table of opts.tables) {
      doc.font("Helvetica-Bold").fontSize(11).text(table.title);
      doc.moveDown(0.25);
      doc.font("Helvetica").fontSize(9);
      doc.text(table.columns.join("  |  "), { width: 500 });
      doc.moveDown(0.15);
      for (const row of table.rows) {
        doc.text(row.join("  |  "), { width: 500 });
        doc.moveDown(0.12);
      }
      doc.moveDown(0.6);
    }

    doc.end();
  });
}
