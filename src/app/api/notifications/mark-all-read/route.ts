import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { notificationsWhereForInbox } from "@/lib/alerts/visibility";

export const runtime = "nodejs";

export async function POST() {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const result = await prisma.notification.updateMany({
    where: {
      AND: [notificationsWhereForInbox(user), { read: false }],
    },
    data: { read: true },
  });

  return NextResponse.json({ ok: true, updated: result.count });
}
