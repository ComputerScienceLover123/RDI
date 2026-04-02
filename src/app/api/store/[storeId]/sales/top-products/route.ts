import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreSalesUser } from "@/lib/sales/salesRoute";
import { parseRangeQuery } from "@/lib/sales/dates";
import { decN } from "@/lib/sales/money";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const auth = await requireStoreSalesUser(params.storeId);
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const range = parseRangeQuery(sp.get("from"), sp.get("to"));
  if ("error" in range) return NextResponse.json({ error: range.error }, { status: 400 });

  const grouped = await prisma.transactionLineItem.groupBy({
    by: ["productId"],
    where: {
      transaction: {
        storeId: params.storeId,
        type: "sale",
        transactionAt: { gte: range.from, lte: range.to },
      },
    },
    _sum: { quantity: true, lineTotal: true },
  });

  const productIds = grouped.map((g) => g.productId);
  if (productIds.length === 0) {
    return NextResponse.json({
      from: range.fromStr,
      to: range.toStr,
      byRevenue: [],
      byUnits: [],
    });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, category: true },
  });
  const pmap = new Map(products.map((p) => [p.id, p]));

  type Row = {
    productId: string;
    name: string;
    category: string;
    unitsSold: number;
    revenue: number;
  };

  const rows: Row[] = grouped.map((g) => {
    const p = pmap.get(g.productId);
    return {
      productId: g.productId,
      name: p?.name ?? "Unknown",
      category: p?.category ?? "other",
      unitsSold: g._sum.quantity ?? 0,
      revenue: Math.round(decN(g._sum.lineTotal) * 100) / 100,
    };
  });

  const byRevenue = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const byUnits = [...rows].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 10);

  return NextResponse.json({ from: range.fromStr, to: range.toStr, byRevenue, byUnits });
}
