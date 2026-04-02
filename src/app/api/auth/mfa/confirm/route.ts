import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { verifyTotpCode, normalizeTotpCode } from "@/lib/auth/mfa";

export const runtime = "nodejs";

type Body = { code: string };

export async function POST(req: NextRequest) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Body | null;
  const code = normalizeTotpCode(String(body?.code ?? ""));
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.accountStatus !== "active") return NextResponse.json({ error: "Account disabled" }, { status: 403 });
  if (!user.mfaSecret) return NextResponse.json({ error: "MFA not initialized" }, { status: 400 });

  const ok = verifyTotpCode(user.mfaSecret, code);
  if (!ok) return NextResponse.json({ error: "Invalid MFA code" }, { status: 400 });

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: true },
  });

  return NextResponse.json({ ok: true });
}

