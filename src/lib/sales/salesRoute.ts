import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAccessStore } from "@/lib/store/storeAccess";
import type { User } from "@prisma/client";

export async function requireStoreSalesUser(
  storeId: string
): Promise<{ ok: true; user: User } | { ok: false; response: NextResponse }> {
  const claims = await getSessionClaims();
  if (!claims) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 403 }) };
  }
  if (!canAccessStore(user, storeId)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return { ok: false, response: NextResponse.json({ error: "Store not found" }, { status: 404 }) };

  return { ok: true, user };
}

export async function requireAdminUser(): Promise<
  { ok: true; user: User } | { ok: false; response: NextResponse }
> {
  const claims = await getSessionClaims();
  if (!claims) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 403 }) };
  }
  if (user.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, user };
}
