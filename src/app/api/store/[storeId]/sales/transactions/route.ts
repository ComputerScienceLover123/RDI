import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreSalesUser } from "@/lib/sales/salesRoute";
import { parseRangeQuery } from "@/lib/sales/dates";
import { canExportSalesData } from "@/lib/sales/salesAccess";
import { decN } from "@/lib/sales/money";
import type { PaymentMethod, Prisma, TransactionType } from "@prisma/client";

export const runtime = "nodejs";

const PAGE_SIZE = 25;

export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const auth = await requireStoreSalesUser(params.storeId);
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const range = parseRangeQuery(sp.get("from"), sp.get("to"));
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });

  const typeFilter = sp.get("type");
  const paymentFilter = sp.get("paymentMethod");
  const employeeId = sp.get("employeeId");
  const q = sp.get("q")?.trim();
  const page = Math.max(1, Number(sp.get("page") || "1") || 1);
  const exportCsv = sp.get("format") === "csv";

  if (exportCsv && !canExportSalesData(auth.user)) {
    return NextResponse.json({ error: "Export not allowed for your role" }, { status: 403 });
  }

  const where: Prisma.PosTransactionWhereInput = {
    storeId: params.storeId,
    transactionAt: { gte: range.from, lte: range.to },
  };

  if (typeFilter && typeFilter !== "all" && ["sale", "refund", "void"].includes(typeFilter)) {
    where.type = typeFilter as TransactionType;
  }
  if (paymentFilter && paymentFilter !== "all" && ["cash", "credit", "debit", "mobile"].includes(paymentFilter)) {
    where.paymentMethod = paymentFilter as PaymentMethod;
  }
  if (employeeId && employeeId !== "all") {
    where.employeeId = employeeId;
  }
  if (q) {
    where.id = { contains: q, mode: "insensitive" };
  }

  const [total, rows] = await Promise.all([
    prisma.posTransaction.count({ where }),
    prisma.posTransaction.findMany({
      where,
      orderBy: { transactionAt: "desc" },
      take: exportCsv ? 5000 : PAGE_SIZE,
      skip: exportCsv ? 0 : (page - 1) * PAGE_SIZE,
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { lineItems: true } },
      },
    }),
  ]);

  if (exportCsv) {
    const header = "timestamp,transactionId,employeeName,type,paymentMethod,itemCount,total\n";
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = rows.map((r) => {
      const ts = r.transactionAt.toISOString();
      const name = `${r.employee.firstName} ${r.employee.lastName}`.trim();
      return [esc(ts), esc(r.id), esc(name), r.type, r.paymentMethod, r._count.lineItems, decN(r.total)].join(",");
    });
    const body = header + lines.join("\n");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="transactions-${params.storeId.slice(0, 8)}.csv"`,
      },
    });
  }

  return NextResponse.json({
    from: range.fromStr,
    to: range.toStr,
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
    transactions: rows.map((r) => ({
      id: r.id,
      transactionAt: r.transactionAt.toISOString(),
      type: r.type,
      paymentMethod: r.paymentMethod,
      itemCount: r._count.lineItems,
      total: decN(r.total),
      employee: {
        id: r.employee.id,
        name: `${r.employee.firstName} ${r.employee.lastName}`.trim(),
      },
    })),
  });
}
