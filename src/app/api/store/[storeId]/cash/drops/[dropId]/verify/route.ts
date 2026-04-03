import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCashVerifier } from "@/lib/cash/routeAuth";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: { storeId: string; dropId: string } }) {
  const auth = await requireCashVerifier(params.storeId);
  if (!auth.ok) return auth.response;

  const drop = await prisma.cashDrop.findFirst({
    where: { id: params.dropId, storeId: params.storeId },
    select: { id: true, verified: true },
  });
  if (!drop) return NextResponse.json({ error: "Drop not found" }, { status: 404 });
  if (drop.verified) return NextResponse.json({ error: "Already verified" }, { status: 409 });

  await prisma.$transaction(async (tx) => {
    await tx.cashDrop.update({
      where: { id: params.dropId },
      data: { verified: true, managerId: auth.user.id, verifiedAt: new Date() },
    });
  });

  return NextResponse.json({ ok: true });
}

