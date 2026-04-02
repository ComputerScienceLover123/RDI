import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canEditOrders } from "@/lib/auth/rbac";
import { getClientIp } from "@/lib/request/ip";

export const runtime = "nodejs";

function makeFakeOrders(storeId: string) {
  const seed = storeId.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const mkId = (n: number) => `ORD-${storeId.slice(-3)}-${String((seed + n * 19) % 10000).padStart(4, "0")}`;
  return [
    { id: mkId(1), status: "pending", totalCents: 1299 + (seed % 900), createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() },
    { id: mkId(2), status: "fulfilled", totalCents: 4999 + ((seed * 7) % 2100), createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString() },
  ];
}

export async function GET(_req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const allowed = user.role === "admin" || user.assignedStoreId === params.storeId;
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ storeId: params.storeId, orders: makeFakeOrders(params.storeId) });
}

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const allowedStore = user.role === "admin" || user.assignedStoreId === params.storeId;
  if (!allowedStore) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!canEditOrders(user.role)) return NextResponse.json({ error: "Managers only" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { note?: string; items?: Array<{ sku: string; quantity: number }> } | null;
  const note = body?.note?.toString().trim() ?? "";

  const ipAddress = getClientIp(req);
  return NextResponse.json({
    ok: true,
    storeId: params.storeId,
    created: {
      id: `ORD-${params.storeId.slice(-3)}-${Math.floor(Math.random() * 90000 + 10000)}`,
      status: "pending",
      note,
    },
    audit: { byUserId: user.id, ipAddress },
  });
}

