import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import type { AccountStatus, UserRole } from "@prisma/client";

export const runtime = "nodejs";

function toEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  if (!v || typeof v !== "string") return null;
  const s = v as T;
  return allowed.includes(s) ? s : null;
}

export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (claims.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null) as
    | {
        firstName?: string;
        lastName?: string;
        role?: UserRole;
        assignedStoreId?: string | null;
        accountStatus?: AccountStatus;
        forcePasswordChange?: boolean;
        mfaEnabled?: boolean;
      }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const role = body.role ? toEnum(body.role, ["admin", "manager", "employee"]) : null;
  const accountStatus = body.accountStatus ? toEnum(body.accountStatus, ["active", "disabled"]) : null;

  const existing = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nextAssignedStoreId = body.assignedStoreId === undefined ? existing.assignedStoreId : body.assignedStoreId;

  if ((role ?? existing.role) !== "admin") {
    if (!nextAssignedStoreId) return NextResponse.json({ error: "assignedStoreId required" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: existing.id },
    data: {
      firstName: body.firstName !== undefined ? body.firstName.toString().trim() : undefined,
      lastName: body.lastName !== undefined ? body.lastName.toString().trim() : undefined,
      role: role ?? undefined,
      assignedStoreId: (role ?? existing.role) === "admin" ? null : nextAssignedStoreId ?? null,
      accountStatus: accountStatus ?? undefined,
      forcePasswordChange: body.forcePasswordChange !== undefined ? Boolean(body.forcePasswordChange) : undefined,
      mfaEnabled: body.mfaEnabled !== undefined ? Boolean(body.mfaEnabled) : undefined,
    },
  });

  return NextResponse.json({ ok: true, userId: updated.id });
}

