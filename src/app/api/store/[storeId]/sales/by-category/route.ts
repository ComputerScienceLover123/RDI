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
    _sum: { lineTotal: true },
  });

  const productIds = grouped.map((g) => g.productId);
  if (productIds.length === 0) {
    return NextResponse.json({ from: range.fromStr, to: range.toStr, categories: [] });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, category: true },
  });
  const pmap = new Map(products.map((p) => [p.id, p.category]));

  const catRevenue = new Map<string, number>();
  for (const g of grouped) {
    const cat = pmap.get(g.productId) ?? "other";
    const rev = decN(g._sum.lineTotal);
    catRevenue.set(cat, (catRevenue.get(cat) ?? 0) + rev);
  }

  const total = [...catRevenue.values()].reduce((a, b) => a + b, 0);
  const categories = [...catRevenue.entries()]
    .map(([category, revenue]) => ({
      category,
      revenue: Math.round(revenue * 100) / 100,
      pct: total > 0 ? Math.round((revenue / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return NextResponse.json({ from: range.fromStr, to: range.toStr, categories, totalRevenue: Math.round(total * 100) / 100 });
}
