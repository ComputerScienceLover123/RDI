import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { getOrCreateNotificationPreferences } from "@/lib/alerts/preferences";

export const runtime = "nodejs";

const PatchSchema = z
  .object({
    lowStock: z.boolean().optional(),
    voidAlert: z.boolean().optional(),
    delivery: z.boolean().optional(),
    auditReminder: z.boolean().optional(),
    shrinkage: z.boolean().optional(),
    system: z.boolean().optional(),
  })
  .strict();

export async function GET() {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const prefs = await getOrCreateNotificationPreferences(user.id);
  return NextResponse.json({
    lowStock: prefs.lowStock,
    voidAlert: prefs.voidAlert,
    delivery: prefs.delivery,
    auditReminder: prefs.auditReminder,
    shrinkage: prefs.shrinkage,
    system: prefs.system,
  });
}

export async function PATCH(req: NextRequest) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  await getOrCreateNotificationPreferences(user.id);
  const prefs = await prisma.userNotificationPreference.update({
    where: { userId: user.id },
    data: parsed.data,
  });

  return NextResponse.json({
    lowStock: prefs.lowStock,
    voidAlert: prefs.voidAlert,
    delivery: prefs.delivery,
    auditReminder: prefs.auditReminder,
    shrinkage: prefs.shrinkage,
    system: prefs.system,
  });
}
