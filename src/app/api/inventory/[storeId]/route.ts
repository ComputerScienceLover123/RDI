import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canEditInventory } from "@/lib/auth/rbac";
import { getClientIp } from "@/lib/request/ip";

export const runtime = "nodejs";

function makeFakeInventory(storeId: string) {
  const seed = storeId.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const mkQty = (n: number) => 12 + ((seed + n * 37) % 60);
  return [
    { sku: `SKU-${storeId.slice(-3)}-001`, name: "Beverage - Cola", quantity: mkQty(1) },
    { sku: `SKU-${storeId.slice(-3)}-014`, name: "Snack - Chips", quantity: mkQty(2) },
    { sku: `SKU-${storeId.slice(-3)}-022`, name: "Dairy - Milk", quantity: mkQty(3) },
  ];
}

export async function GET(_req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const allowed = user.role === "admin" || user.assignedStoreId === params.storeId;
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ storeId: params.storeId, items: makeFakeInventory(params.storeId) });
}

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const allowedStore = user.role === "admin" || user.assignedStoreId === params.storeId;
  if (!allowedStore) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!canEditInventory(user.role)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { name?: string; quantity?: number } | null;
  const name = body?.name?.toString().trim() ?? "";
  const quantity = Number(body?.quantity ?? NaN);
  if (!name || !Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Demo: we don't persist inventory in this prototype.
  const ipAddress = getClientIp(req);
  return NextResponse.json({
    ok: true,
    storeId: params.storeId,
    added: { sku: `SKU-${params.storeId.slice(-3)}-${String(name.length).padStart(3, "0")}`, name, quantity },
    audit: { byUserId: user.id, ipAddress },
  });
}

