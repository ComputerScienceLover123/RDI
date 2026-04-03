import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canManageLottery } from "@/lib/store/lotteryAccess";

export const runtime = "nodejs";

const patchBody = z.object({
  status: z.literal("returned"),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { storeId: string; packId: string } },
) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { storeId, packId } = params;
  if (!canManageLottery(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const pack = await prisma.lotteryPack.findFirst({
    where: { id: packId, storeId },
  });
  if (!pack) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pack.status !== "inventory" && pack.status !== "activated") {
    return NextResponse.json({ error: "Only inventory or activated packs can be marked returned" }, { status: 400 });
  }

  await prisma.lotteryPack.update({
    where: { id: packId },
    data: { status: "returned" },
  });

  return NextResponse.json({ ok: true });
}
