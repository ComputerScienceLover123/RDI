import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canEditSchedule } from "@/lib/store/scheduleAccess";
import { validateShiftDuration } from "@/lib/store/shiftTime";

export const runtime = "nodejs";

const patchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  startMinutes: z.number().int().optional(),
  endMinutes: z.number().int().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { storeId: string; templateId: string } },
) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { storeId, templateId } = params;
  if (!canEditSchedule(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.shiftTemplate.findFirst({ where: { id: templateId, storeId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = patchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const startMinutes = parsed.data.startMinutes ?? existing.startMinutes;
  const endMinutes = parsed.data.endMinutes ?? existing.endMinutes;
  const v = validateShiftDuration(startMinutes, endMinutes);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    const t = await prisma.shiftTemplate.update({
      where: { id: templateId },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.startMinutes !== undefined ? { startMinutes: parsed.data.startMinutes } : {}),
        ...(parsed.data.endMinutes !== undefined ? { endMinutes: parsed.data.endMinutes } : {}),
      },
    });
    return NextResponse.json({
      template: {
        id: t.id,
        name: t.name,
        startMinutes: t.startMinutes,
        endMinutes: t.endMinutes,
      },
    });
  } catch (e: unknown) {
    const code = typeof e === "object" && e && "code" in e ? (e as { code?: string }).code : "";
    if (code === "P2002") {
      return NextResponse.json({ error: "A template with that name already exists" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { storeId: string; templateId: string } },
) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { storeId, templateId } = params;
  if (!canEditSchedule(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.shiftTemplate.findFirst({ where: { id: templateId, storeId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.shiftTemplate.delete({ where: { id: templateId } });
  return NextResponse.json({ ok: true });
}
