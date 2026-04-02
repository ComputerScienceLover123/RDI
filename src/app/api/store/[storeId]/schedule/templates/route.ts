import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canEditSchedule } from "@/lib/store/scheduleAccess";
import { validateShiftDuration } from "@/lib/store/shiftTime";

export const runtime = "nodejs";

const createBody = z.object({
  name: z.string().min(1).max(80),
  startMinutes: z.number().int(),
  endMinutes: z.number().int(),
});

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canEditSchedule(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = createBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const name = parsed.data.name.trim();
  const v = validateShiftDuration(parsed.data.startMinutes, parsed.data.endMinutes);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    const t = await prisma.shiftTemplate.create({
      data: {
        storeId,
        name,
        startMinutes: parsed.data.startMinutes,
        endMinutes: parsed.data.endMinutes,
        createdById: user.id,
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
