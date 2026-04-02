import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { generateTotpSecret, mfaIssuer } from "@/lib/auth/mfa";

export const runtime = "nodejs";

export async function POST(_req: NextRequest) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.accountStatus !== "active") return NextResponse.json({ error: "Account disabled" }, { status: 403 });

  if (user.mfaSecret && user.mfaEnabled) {
    return NextResponse.json({ alreadyEnabled: true, issuer: mfaIssuer });
  }

  const { secret, otpauthUrl } = generateTotpSecret(user.email);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      mfaSecret: secret,
      mfaEnabled: false, // require a confirmation code first
    },
  });

  return NextResponse.json({ ok: true, issuer: mfaIssuer, secret, otpauthUrl });
}

