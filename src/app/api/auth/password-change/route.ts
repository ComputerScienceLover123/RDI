import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { hashPassword } from "@/lib/auth/password";
import { signSessionToken } from "@/lib/auth/jwt";
import { setHttpOnlyCookie, clearCookie } from "@/lib/auth/sessionCookies";
import { env } from "@/lib/env";

export const runtime = "nodejs";

type Body = { newPassword: string };

export async function POST(req: NextRequest) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  const newPassword = body?.newPassword ?? "";
  if (!newPassword || typeof newPassword !== "string") {
    return NextResponse.json({ error: "Missing newPassword" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.accountStatus !== "active") return NextResponse.json({ error: "Account disabled" }, { status: 403 });
  if (!user.forcePasswordChange) return NextResponse.json({ error: "Password change not required" }, { status: 409 });

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, forcePasswordChange: false },
  });

  const sessionToken = await signSessionToken({
    sub: user.id,
    role: user.role,
    storeId: user.role === "admin" ? null : user.assignedStoreId ?? null,
    forcePasswordChange: false,
  });

  setHttpOnlyCookie({
    name: env.SESSION_COOKIE_NAME,
    value: sessionToken,
    maxAgeSeconds: Number(env.JWT_SESSION_TTL_SECONDS),
    path: "/",
  });
  clearCookie(env.MFA_PENDING_COOKIE_NAME);

  return NextResponse.json({ ok: true });
}

