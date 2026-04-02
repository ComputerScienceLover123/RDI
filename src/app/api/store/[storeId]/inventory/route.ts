import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAccessStore } from "@/lib/store/storeAccess";
import { getEffectiveRetailMap } from "@/lib/pricing/effectiveRetail";
import type { Prisma, ProductCategory } from "@prisma/client";

export const runtime = "nodejs";

/** Category enum strings (must match Prisma `ProductCategory`) for fuzzy search. */
const ALL_PRODUCT_CATEGORIES: ProductCategory[] = [
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

const SORT_KEYS = new Set([
  "productName",
  "upc",
  "category",
  "vendorName",
  "costPrice",
  "retailPrice",
  "quantityOnHand",
  "minStockThreshold",
]);

function buildProductWhere(
  q: string | null,
  category: string | null,
  vendorId: string | null
): Prisma.ProductWhereInput {
  const parts: Prisma.ProductWhereInput[] = [];
  if (q && q.trim()) {
    const term = q.trim();
    const termLower = term.toLowerCase();

    const categoriesMatchingTerm = ALL_PRODUCT_CATEGORIES.filter((c) => c.toLowerCase().includes(termLower));

    const searchClauses: Prisma.ProductWhereInput[] = [
      { name: { contains: term, mode: "insensitive" } },
      { upc: { contains: term, mode: "insensitive" } },
      { brand: { contains: term, mode: "insensitive" } },
      { vendor: { companyName: { contains: term, mode: "insensitive" } } },
    ];

    for (const cat of categoriesMatchingTerm) {
      searchClauses.push({ category: cat });
    }

    parts.push({ OR: searchClauses });
  }
  if (category && category !== "all") {
    parts.push({ category: category as ProductCategory });
  }
  if (vendorId && vendorId !== "all") {
    parts.push({ vendorId });
  }
  if (parts.length === 0) return {};
  return { AND: parts };
}

export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canAccessStore(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  const category = searchParams.get("category");
  const vendorId = searchParams.get("vendorId");
  const lowStockOnly = searchParams.get("lowStockOnly") === "1" || searchParams.get("lowStockOnly") === "true";
  const sortKey = searchParams.get("sortBy") ?? "productName";
  const sortDir = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";

  if (!SORT_KEYS.has(sortKey)) {
    return NextResponse.json({ error: "Invalid sortBy" }, { status: 400 });
  }

  const built = buildProductWhere(q, category, vendorId);
  const productWhere: Prisma.ProductWhereInput =
    Object.keys(built).length > 0 ? { AND: [built, { active: true }] } : { active: true };

  const allStoreInventory = await prisma.inventory.findMany({
    where: { storeId, product: { active: true } },
  });
  const lowStockCountTotal = allStoreInventory.filter((r) => r.quantityOnHand <= r.minStockThreshold).length;

  let rows = await prisma.inventory.findMany({
    where: {
      storeId,
      product: productWhere,
    },
    include: {
      product: {
        include: { vendor: true },
      },
    },
  });

  if (lowStockOnly) {
    rows = rows.filter((r) => r.quantityOnHand <= r.minStockThreshold);
  }

  const productIds = rows.map((r) => r.productId);
  const effectiveRetail = await getEffectiveRetailMap(storeId, productIds);

  const dir = sortDir === "desc" ? -1 : 1;
  rows.sort((a, b) => {
    const cmp = (x: string | number, y: string | number) => (x < y ? -1 : x > y ? 1 : 0);
    const effR = (row: (typeof rows)[0]) => effectiveRetail.get(row.productId) ?? row.product.retailPrice;
    switch (sortKey) {
      case "productName":
        return cmp(a.product.name.toLowerCase(), b.product.name.toLowerCase()) * dir;
      case "upc":
        return cmp(a.product.upc, b.product.upc) * dir;
      case "category":
        return cmp(a.product.category, b.product.category) * dir;
      case "vendorName":
        return cmp(a.product.vendor.companyName.toLowerCase(), b.product.vendor.companyName.toLowerCase()) * dir;
      case "costPrice":
        return a.product.costPrice.comparedTo(b.product.costPrice) * dir;
      case "retailPrice":
        return effR(a).comparedTo(effR(b)) * dir;
      case "quantityOnHand":
        return cmp(a.quantityOnHand, b.quantityOnHand) * dir;
      case "minStockThreshold":
        return cmp(a.minStockThreshold, b.minStockThreshold) * dir;
      default:
        return 0;
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

  return NextResponse.json({
    store: { id: store.id, name: store.name },
    rows: rows.map((r) => {
      const master = r.product.retailPrice;
      const eff = effectiveRetail.get(r.productId) ?? master;
      const overridden = eff.toString() !== master.toString();
      return {
        inventoryId: r.id,
        productId: r.productId,
        productName: r.product.name,
        upc: r.product.upc,
        category: r.product.category,
        vendorName: r.product.vendor.companyName,
        vendorId: r.product.vendorId,
        costPrice: r.product.costPrice.toString(),
        retailPrice: eff.toString(),
        masterRetailPrice: overridden ? master.toString() : undefined,
        priceOverridden: overridden,
        quantityOnHand: r.quantityOnHand,
        minStockThreshold: r.minStockThreshold,
        lastCountedAt: r.lastCountedAt?.toISOString() ?? null,
      };
    }),
    lowStockCount: lowStockCountTotal,
    vendors,
    categories,
    sortBy: sortKey,
    sortOrder: sortDir,
  });
}
