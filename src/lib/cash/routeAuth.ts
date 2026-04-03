import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAccessStore } from "@/lib/store/storeAccess";
import type { User } from "@prisma/client";

function forbidden() {
  return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

export async function requireCashStoreUser(storeId: string): Promise<{ ok: true; user: User } | ReturnType<typeof forbidden>> {
  const claims = await getSessionClaims();
  if (!claims) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 403 }) };
  }
  if (!canAccessStore(user, storeId)) return forbidden();
  return { ok: true, user };
}

export async function requireCashManagerOrAdmin(storeId: string): Promise<{ ok: true; user: User } | ReturnType<typeof forbidden>> {
  const auth = await requireCashStoreUser(storeId);
  if (!auth.ok) return auth;
  if (auth.user.role !== "admin" && !(auth.user.role === "manager" && auth.user.assignedStoreId === storeId)) return forbidden();
  return auth;
}

export async function requireCashVerifier(storeId: string): Promise<{ ok: true; user: User } | ReturnType<typeof forbidden>> {
  // Same access as managers/admins: verify register closes, verify drops, and run safe counts.
  return requireCashManagerOrAdmin(storeId);
}

