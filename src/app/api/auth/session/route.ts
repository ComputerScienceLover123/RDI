import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";

export const runtime = "nodejs";

export async function GET() {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ user: null });

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      assignedStoreId: true,
      accountStatus: true,
      forcePasswordChange: true,
    },
  });

  if (!user || user.accountStatus !== "active") {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      assignedStoreId: user.assignedStoreId,
      forcePasswordChange: user.forcePasswordChange,
    },
  });
}
