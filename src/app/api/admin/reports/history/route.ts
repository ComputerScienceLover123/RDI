import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const rows = await prisma.hqGeneratedReport.findMany({
    where: { expiresAt: { gte: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { generatedBy: { select: { firstName: true, lastName: true, email: true } } },
  });

  return NextResponse.json({
    reports: rows.map((r) => ({
      id: r.id,
      displayName: r.displayName,
      reportType: r.reportType,
      dateFrom: r.dateFrom.toISOString().slice(0, 10),
      dateTo: r.dateTo.toISOString().slice(0, 10),
      generatedByName: `${r.generatedBy.firstName} ${r.generatedBy.lastName}`,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    })),
  });
}
