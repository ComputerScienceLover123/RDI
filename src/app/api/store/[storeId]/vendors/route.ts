import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canViewPurchaseOrders } from "@/lib/store/purchaseOrderAccess";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  if (!canViewPurchaseOrders(user, params.storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const vendors = await prisma.vendor.findMany({
    where: { active: true },
    orderBy: { companyName: "asc" },
    select: { id: true, companyName: true },
  });

  return NextResponse.json({ vendors });
}
