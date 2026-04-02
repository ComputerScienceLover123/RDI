import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import type { Prisma, ProductCategory } from "@prisma/client";

export const runtime = "nodejs";

function marginPct(cost: { toNumber: () => number }, retail: { toNumber: () => number }): number | null {
  const r = retail.toNumber();
  const c = cost.toNumber();
  if (r <= 0) return null;
  return Math.round(((r - c) / r) * 10000) / 100;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const category = sp.get("category");
  const vendorId = sp.get("vendorId");
  const active = sp.get("active") ?? "all";
  const sortBy = sp.get("sortBy") ?? "name";
  const sortOrder = sp.get("sortOrder") === "desc" ? "desc" : "asc";

  const where: Prisma.ProductWhereInput = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { upc: { contains: q, mode: "insensitive" } },
      { brand: { contains: q, mode: "insensitive" } },
      { vendor: { companyName: { contains: q, mode: "insensitive" } } },
    ];
  }
  if (category && category !== "all") {
    where.category = category as ProductCategory;
  }
  if (vendorId && vendorId !== "all") {
    where.vendorId = vendorId;
  }
  if (active === "true") where.active = true;
  if (active === "false") where.active = false;

  const products = await prisma.product.findMany({
    where,
    include: { vendor: { select: { id: true, companyName: true } } },
  });

  const overrideRows = await prisma.storeProductPriceOverride.findMany({ select: { productId: true } });
  const ocMap = new Map<string, number>();
  for (const o of overrideRows) {
    ocMap.set(o.productId, (ocMap.get(o.productId) ?? 0) + 1);
  }

  type Row = {
    id: string;
    name: string;
    upc: string;
    category: string;
    brand: string | null;
    vendorId: string;
    vendorName: string;
    costPrice: string;
    retailPrice: string;
    marginPct: number | null;
    taxEligible: boolean;
    active: boolean;
    overrideStoreCount: number;
  };

  let rows: Row[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    upc: p.upc,
    category: p.category,
    brand: p.brand,
    vendorId: p.vendorId,
    vendorName: p.vendor.companyName,
    costPrice: p.costPrice.toString(),
    retailPrice: p.retailPrice.toString(),
    marginPct: marginPct(p.costPrice, p.retailPrice),
    taxEligible: p.taxEligible,
    active: p.active,
    overrideStoreCount: ocMap.get(p.id) ?? 0,
  }));

  const dir = sortOrder === "desc" ? -1 : 1;
  const cmp = (a: string | number | null, b: string | number | null) => {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return a < b ? -1 : a > b ? 1 : 0;
  };

  rows.sort((a, b) => {
    switch (sortBy) {
      case "name":
        return cmp(a.name.toLowerCase(), b.name.toLowerCase()) * dir;
      case "upc":
        return cmp(a.upc, b.upc) * dir;
      case "category":
        return cmp(a.category, b.category) * dir;
      case "brand":
        return cmp((a.brand ?? "").toLowerCase(), (b.brand ?? "").toLowerCase()) * dir;
      case "vendorName":
        return cmp(a.vendorName.toLowerCase(), b.vendorName.toLowerCase()) * dir;
      case "costPrice":
        return cmp(Number(a.costPrice), Number(b.costPrice)) * dir;
      case "retailPrice":
        return cmp(Number(a.retailPrice), Number(b.retailPrice)) * dir;
      case "marginPct":
        return cmp(a.marginPct ?? -1, b.marginPct ?? -1) * dir;
      case "taxEligible":
        return cmp(Number(a.taxEligible), Number(b.taxEligible)) * dir;
      case "active":
        return cmp(Number(a.active), Number(b.active)) * dir;
      case "overrideStoreCount":
        return cmp(a.overrideStoreCount, b.overrideStoreCount) * dir;
      default:
        return cmp(a.name.toLowerCase(), b.name.toLowerCase());
    }
  });

  const vendors = await prisma.vendor.findMany({
    where: { active: true },
    orderBy: { companyName: "asc" },
    select: { id: true, companyName: true },
  });

  const categories = [
    "tobacco",
    "beverages",
    "snacks",
    "candy",
    "grocery",
    "foodservice",
    "lottery",
    "fuel",
    "other",
  ];

  return NextResponse.json({ products: rows, vendors, categories });
}
