import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { parseLocalYMD } from "@/lib/sales/dates";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const programId = sp.get("programId")?.trim();
  const statusRaw = sp.get("status")?.trim();
  const from = sp.get("from")?.trim();
  const to = sp.get("to")?.trim();

  const where: Prisma.ScanDataSubmissionWhereInput = {};
  if (programId) where.programId = programId;
  const statuses = ["pending", "submitted", "confirmed", "paid"] as const;
  if (statusRaw && (statuses as readonly string[]).includes(statusRaw)) {
    where.status = statusRaw as (typeof statuses)[number];
  }
  if (from || to) {
    where.reportingPeriodStart = {};
    if (from) {
      const d = parseLocalYMD(from);
      if (d) where.reportingPeriodStart.gte = d;
    }
    if (to) {
      const d = parseLocalYMD(to);
      if (d) where.reportingPeriodStart.lte = d;
    }
  }

  const rows = await prisma.scanDataSubmission.findMany({
    where,
    orderBy: [{ reportingPeriodEnd: "desc" }, { storeId: "asc" }],
    take: 500,
    include: {
      program: { select: { programName: true, manufacturerName: true } },
      store: { select: { name: true } },
      submittedBy: { select: { firstName: true, lastName: true } },
    },
  });

  return NextResponse.json({
    submissions: rows.map((r) => {
      const expected = Number(r.totalRebateValueCalculated);
      const paid = r.paymentAmountReceived != null ? Number(r.paymentAmountReceived) : null;
      const mismatch =
        paid != null && r.status === "paid" && Math.abs(paid - expected) > 0.02;
      return {
        id: r.id,
        programId: r.programId,
        programName: r.program.programName,
        manufacturerName: r.program.manufacturerName,
        storeId: r.storeId,
        storeName: r.store.name,
        reportingPeriodStart: r.reportingPeriodStart.toISOString().slice(0, 10),
        reportingPeriodEnd: r.reportingPeriodEnd.toISOString().slice(0, 10),
        totalQualifyingUnitsSold: r.totalQualifyingUnitsSold,
        totalRebateValueCalculated: r.totalRebateValueCalculated.toString(),
        status: r.status,
        submittedAt: r.submittedAt?.toISOString() ?? null,
        paymentReceivedAt: r.paymentReceivedAt?.toISOString().slice(0, 10) ?? null,
        paymentAmountReceived: r.paymentAmountReceived?.toString() ?? null,
        paymentMismatch: mismatch,
        submittedByName:
          r.submittedBy ? `${r.submittedBy.firstName} ${r.submittedBy.lastName}` : null,
        fileFormat: r.fileFormat,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  });
}
