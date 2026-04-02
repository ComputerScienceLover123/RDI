import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getClientIp } from "@/lib/request/ip";
import { verifyPassword } from "@/lib/auth/password";
import { signMfaPendingToken, signSessionToken } from "@/lib/auth/jwt";
import { setHttpOnlyCookie, clearCookie } from "@/lib/auth/sessionCookies";
import { logLoginAttempt } from "@/lib/auth/loginAttempts";

export const runtime = "nodejs";

type LoginBody = { email: string; password: string };

export async function POST(req: NextRequest) {
  const ipAddress = getClientIp(req);
  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body?.email?.toLowerCase().trim();
  const password = typeof body?.password === "string" ? body.password.trim() : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Missing email or password" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await logLoginAttempt({ userId: null, ipAddress, mfaUsed: false, success: false });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (user.accountStatus !== "active") {
    await logLoginAttempt({ userId: user.id, ipAddress, mfaUsed: false, success: false });
    return NextResponse.json({ error: "Account disabled" }, { status: 403 });
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    await logLoginAttempt({ userId: user.id, ipAddress, mfaUsed: false, success: false });
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Stage 1: password verified.
  if (user.mfaEnabled && user.mfaSecret) {
    await logLoginAttempt({ userId: user.id, ipAddress, mfaUsed: false, success: false });

    const pendingToken = await signMfaPendingToken({ sub: user.id });
    setHttpOnlyCookie({
      name: env.MFA_PENDING_COOKIE_NAME,
      value: pendingToken,
      maxAgeSeconds: Number(env.JWT_MFA_PENDING_TTL_SECONDS),
      path: "/",
    });

    return NextResponse.json({ mfaRequired: true });
  }

  // Stage 2: issue full session (MFA not required).
  await logLoginAttempt({ userId: user.id, ipAddress, mfaUsed: false, success: true });

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

  return NextResponse.json({
    ok: true,
    forcePasswordChange: updatedUser.forcePasswordChange,
  });
}

