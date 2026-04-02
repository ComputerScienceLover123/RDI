import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { runAlertChecks } from "@/lib/alerts/runChecks";

export const runtime = "nodejs";

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.ALERTS_CRON_SECRET;
  if (!secret) return false;
  const h = req.headers.get("authorization");
  return h === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (authorizeCron(req)) {
    const result = await runAlertChecks();
    return NextResponse.json(result);
  }

  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await runAlertChecks();
  return NextResponse.json(result);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST to run checks (admin session or Bearer ALERTS_CRON_SECRET).",
  });
}
