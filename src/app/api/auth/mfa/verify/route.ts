import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getClientIp } from "@/lib/request/ip";
import { getMfaPendingClaims } from "@/lib/auth/session.server";
import { normalizeTotpCode, verifyTotpCode } from "@/lib/auth/mfa";
import { signSessionToken } from "@/lib/auth/jwt";
import { setHttpOnlyCookie, clearCookie } from "@/lib/auth/sessionCookies";
import { logLoginAttempt } from "@/lib/auth/loginAttempts";

export const runtime = "nodejs";

type VerifyBody = { code: string };

export async function POST(req: NextRequest) {
  const ipAddress = getClientIp(req);
  let body: VerifyBody;
  try {
    body = (await req.json()) as VerifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const code = String(body?.code ?? "");
  const normalized = normalizeTotpCode(code);
  if (!normalized) return NextResponse.json({ error: "Missing MFA code" }, { status: 400 });

  const pending = await getMfaPendingClaims();
  if (!pending) return NextResponse.json({ error: "MFA session missing" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: pending.sub } });
  if (!user || user.accountStatus !== "active" || !user.mfaEnabled || !user.mfaSecret) {
    await logLoginAttempt({ userId: pending.sub, ipAddress, mfaUsed: true, success: false });
    return NextResponse.json({ error: "Invalid MFA state" }, { status: 401 });
  }

  const ok = verifyTotpCode(user.mfaSecret, normalized);
  if (!ok) {
    await logLoginAttempt({ userId: user.id, ipAddress, mfaUsed: true, success: false });
    return NextResponse.json({ error: "Invalid MFA code" }, { status: 401 });
  }

  await logLoginAttempt({ userId: user.id, ipAddress, mfaUsed: true, success: true });

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
    select: { id: true, role: true, assignedStoreId: true, forcePasswordChange: true, mfaEnabled: true, mfaSecret: true },
  });

  const sessionToken = await signSessionToken({
    sub: updatedUser.id,
    role: updatedUser.role,
    storeId: updatedUser.role === "admin" ? null : updatedUser.assignedStoreId ?? null,
    forcePasswordChange: updatedUser.forcePasswordChange,
  });

  setHttpOnlyCookie({
    name: env.SESSION_COOKIE_NAME,
    value: sessionToken,
    maxAgeSeconds: Number(env.JWT_SESSION_TTL_SECONDS),
    path: "/",
  });
  clearCookie(env.MFA_PENDING_COOKIE_NAME);

  return NextResponse.json({ ok: true, forcePasswordChange: user.forcePasswordChange });
}

