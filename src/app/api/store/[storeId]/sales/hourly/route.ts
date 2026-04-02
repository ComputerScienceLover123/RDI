import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreSalesUser } from "@/lib/sales/salesRoute";
import { parseRangeQuery } from "@/lib/sales/dates";

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
    select: { transactionAt: true },
  });

  const counts = Array.from({ length: 24 }, () => 0);
  for (const r of rows) {
    const h = r.transactionAt.getHours();
    counts[h] += 1;
  }

  const max = Math.max(1, ...counts);
  const hours = counts.map((transactionCount, hour) => ({
    hour,
    transactionCount,
    intensity: Math.round((transactionCount / max) * 100) / 100,
  }));

  return NextResponse.json({ from: range.fromStr, to: range.toStr, hours, maxCount: Math.max(...counts) });
}
