import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { getClientIp } from "@/lib/request/ip";
import { hashPassword } from "@/lib/auth/password";
import type { UserRole, AccountStatus } from "@prisma/client";

export const runtime = "nodejs";

function toEnum<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  if (!v || typeof v !== "string") return null;
  const s = v as T;
  return allowed.includes(s) ? s : null;
}

export async function GET(req: NextRequest) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (claims.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [stores, users] = await Promise.all([
    prisma.store.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { assignedStore: true },
    }),
  ]);

  return NextResponse.json({
    stores: stores.map((s) => ({ id: s.id, name: s.name })),
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      assignedStoreId: u.assignedStoreId,
      accountStatus: u.accountStatus,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      mfaEnabled: u.mfaEnabled,
      forcePasswordChange: u.forcePasswordChange,
      storeName: u.assignedStore?.name ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (claims.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null) as
    | {
        email: string;
        password: string;
        firstName: string;
        lastName: string;
        role: UserRole;
        assignedStoreId?: string | null;
        accountStatus?: AccountStatus;
        forcePasswordChange?: boolean;
        mfaEnabled?: boolean;
        mfaSecret?: string | null;
      }
    | null;

  if (!body) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const role = toEnum(body.role, ["admin", "manager", "employee"]);
  const accountStatus = toEnum(body.accountStatus, ["active", "disabled"]);
  if (!role || !accountStatus) return NextResponse.json({ error: "Invalid role/accountStatus" }, { status: 400 });

  const email = body.email?.toLowerCase().trim();
  const password = body.password ?? "";
  const firstName = body.firstName?.toString().trim() ?? "";
  const lastName = body.lastName?.toString().trim() ?? "";
  const assignedStoreId = body.assignedStoreId ? body.assignedStoreId.toString() : null;
  const forcePasswordChange = Boolean(body.forcePasswordChange);
  const mfaEnabled = Boolean(body.mfaEnabled);
  const mfaSecret = body.mfaSecret ? body.mfaSecret.toString() : null;

  if (!email || typeof password !== "string" || password.length < 6) {
    return NextResponse.json({ error: "Invalid email/password" }, { status: 400 });
  }
  if (!firstName || !lastName) return NextResponse.json({ error: "Missing name" }, { status: 400 });
  if ((role === "manager" || role === "employee") && !assignedStoreId) {
    return NextResponse.json({ error: "assignedStoreId required for manager/employee" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "Email already exists" }, { status: 409 });

  const passwordHash = await hashPassword(password);

  await prisma.user.create({
    data: {
      email,
      passwordHash,
      firstName,
      lastName,
      role,
      assignedStoreId: role === "admin" ? null : assignedStoreId,
      accountStatus,
      mfaEnabled: mfaEnabled && Boolean(mfaSecret),
      mfaSecret: mfaEnabled && mfaSecret ? mfaSecret : null,
      forcePasswordChange,
    },
  });

  // Admin actions aren't login attempts; still keep consistent audit logging for failed login attempts only.
  // (No login_attempt entry here.)
  return NextResponse.json({ ok: true });
}

