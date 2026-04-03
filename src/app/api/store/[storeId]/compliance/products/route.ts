import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePosSimUser } from "@/lib/compliance/routeAuth";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const auth = await requirePosSimUser(params.storeId);
  if (!auth.ok) return auth.response;

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";

  const products = await prisma.product.findMany({
    where: {
      active: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { upc: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      upc: true,
      category: true,
      retailPrice: true,
      ageRestricted: true,
      minimumAge: true,
    },
    orderBy: { name: "asc" },
    take: 80,
  });

  return NextResponse.json({
    products: products.map((p) => ({
      ...p,
      retailPrice: p.retailPrice.toString(),
    })),
  });
}
