import { prisma } from "../prisma";
import { getSessionClaims } from "./session.server";
import { NextResponse } from "next/server";

export async function getAuthedUser() {
  const claims = await getSessionClaims();
  if (!claims) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (user.accountStatus !== "active") return { ok: false as const, response: NextResponse.json({ error: "Account disabled" }, { status: 403 }) };

  return { ok: true as const, user, claims };
}

