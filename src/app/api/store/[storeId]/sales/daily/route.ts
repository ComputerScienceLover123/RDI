import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreSalesUser } from "@/lib/sales/salesRoute";
import { formatLocalYMD, parseRangeQuery } from "@/lib/sales/dates";
import { decN } from "@/lib/sales/money";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const auth = await requireStoreSalesUser(params.storeId);
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const range = parseRangeQuery(sp.get("from"), sp.get("to"));
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });

  const rows = await prisma.posTransaction.findMany({
    where: {
      storeId: params.storeId,
      transactionAt: { gte: range.from, lte: range.to },
    },
    select: { transactionAt: true, type: true, total: true },
  });

  const byDay = new Map<string, { gross: number; net: number; saleCount: number }>();
  for (const r of rows) {
    const key = formatLocalYMD(r.transactionAt);
    let b = byDay.get(key);
    if (!b) {
      b = { gross: 0, net: 0, saleCount: 0 };
      byDay.set(key, b);
    }
    const t = decN(r.total);
    const ty = r.type;
    if (ty === "sale") {
      b.gross += t;
      b.net += t;
      b.saleCount += 1;
    } else if (ty === "refund") {
      b.net -= t;
    }
  }

  const days: { date: string; grossSales: number; netSales: number; saleCount: number }[] = [];
  const cursor = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate());
  const endDay = new Date(range.to.getFullYear(), range.to.getMonth(), range.to.getDate());
  while (cursor.getTime() <= endDay.getTime()) {
    const key = formatLocalYMD(cursor);
    const b = byDay.get(key) ?? { gross: 0, net: 0, saleCount: 0 };
    days.push({
      date: key,
      grossSales: Math.round(b.gross * 100) / 100,
      netSales: Math.round(b.net * 100) / 100,
      saleCount: b.saleCount,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return NextResponse.json({ from: range.fromStr, to: range.toStr, days });
}
