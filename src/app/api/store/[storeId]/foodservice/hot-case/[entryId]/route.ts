import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canOperateHotCase } from "@/lib/store/foodserviceAccess";

export const runtime = "nodejs";

const patchBody = z.object({
  disposition: z.enum(["sold", "wasted"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { storeId: string; entryId: string } },
) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { storeId, entryId } = params;
  if (!canOperateHotCase(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const entry = await prisma.foodserviceHotCaseEntry.findFirst({
    where: { id: entryId, storeId, status: "active" },
  });
  if (!entry) return NextResponse.json({ error: "Entry not found or already cleared" }, { status: 404 });

  const now = new Date();
  const wasExpired = entry.expiresAt.getTime() < now.getTime();

  await prisma.$transaction(async (tx) => {
    await tx.foodserviceHotCaseEntry.update({
      where: { id: entryId },
      data: {
        status: parsed.data.disposition === "sold" ? "sold" : "wasted",
        disposedAt: now,
        disposedById: user.id,
      },
    });
    if (parsed.data.disposition === "wasted") {
      await tx.foodserviceWasteLog.create({
        data: {
          storeId,
          menuItemId: entry.menuItemId,
          quantity: entry.quantityPlaced,
          reason: wasExpired ? "expired_hold" : "other",
          loggedById: user.id,
          hotCaseEntryId: entry.id,
        },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
