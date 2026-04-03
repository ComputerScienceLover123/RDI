import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { complianceLogsForRange, countAgeRestrictedGapsInRange, employeeScorecard } from "@/lib/compliance/stats";
import { complianceOverviewToCsv, renderCompliancePdf } from "@/lib/compliance/exportReport";
import { parseRangeQuery } from "@/lib/sales/dates";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const range = parseRangeQuery(sp.get("dateFrom"), sp.get("dateTo"));
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });

  const format = (sp.get("format") ?? "csv").toLowerCase();
  if (format !== "csv" && format !== "pdf") {
    return NextResponse.json({ error: "format must be csv or pdf" }, { status: 400 });
  }

  const detailStoreId = sp.get("storeId")?.trim() ?? null;

  const stores = await prisma.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

  const storeRows: string[][] = [["Store", "Approved", "Declined", "Total verifications", "Rate %", "Gaps", "Flagged"]];
  let empRows: string[][] | null = null;
  for (const s of stores) {
    const [logs, gaps] = await Promise.all([
      complianceLogsForRange(s.id, range.from, range.to),
      countAgeRestrictedGapsInRange(s.id, range.from, range.to),
    ]);
    const rate = logs.total > 0 ? ((logs.approved / logs.total) * 100).toFixed(2) : "—";
    const flagged =
      gaps > 0 || (logs.total > 0 && logs.approved < logs.total) ? "yes" : "no";
    storeRows.push([
      s.name,
      String(logs.approved),
      String(logs.declined),
      String(logs.total),
      rate,
      String(gaps),
      flagged,
    ]);
  }

  const company = process.env.COMPANY_NAME ?? "RDI";
  const rangeLabel = `${range.fromStr} → ${range.toStr}`;

  const tables: { title: string; columns: string[]; rows: string[][] }[] = [
    {
      title: "Chain compliance by store",
      columns: storeRows[0]!,
      rows: storeRows.slice(1),
    },
  ];

  if (detailStoreId && stores.some((s) => s.id === detailStoreId)) {
    const employees = await prisma.user.findMany({
      where: {
        assignedStoreId: detailStoreId,
        accountStatus: "active",
        role: { in: ["employee", "manager"] },
      },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    empRows = [
      ["Employee", "Role", "Age-restricted lines", "Approved logs", "Declined logs", "Gaps", "Verification rate %"],
    ];
    for (const e of employees) {
      const card = await employeeScorecard(detailStoreId, e.id, range.from, range.to);
      empRows.push([
        `${e.firstName} ${e.lastName}`.trim(),
        e.role,
        String(card.ageRestrictedLineCount),
        String(card.approvedVerifications),
        String(card.declinedVerifications),
        String(card.gapCount),
        card.verificationRate != null ? String(card.verificationRate) : "—",
      ]);
    }
    tables.push({
      title: `Employee scorecards — ${stores.find((x) => x.id === detailStoreId)?.name ?? detailStoreId}`,
      columns: empRows[0]!,
      rows: empRows.slice(1),
    });
  }

  if (format === "csv") {
    let csv = `Age compliance — ${rangeLabel}\n\nChain by store\n${complianceOverviewToCsv(storeRows)}`;
    if (empRows) {
      csv += `\n\nEmployee scorecards\n${complianceOverviewToCsv(empRows)}`;
    }
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="compliance-export-${range.fromStr}-${range.toStr}.csv"`,
      },
    });
  }

  const buf = await renderCompliancePdf({
    title: "Age compliance overview",
    company,
    rangeLabel,
    tables,
  });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="compliance-export-${range.fromStr}-${range.toStr}.pdf"`,
    },
  });
}
