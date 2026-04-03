import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCashVerifier } from "@/lib/cash/routeAuth";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: { storeId: string; registerId: string } }) {
  const auth = await requireCashVerifier(params.storeId);
  if (!auth.ok) return auth.response;

  const register = await prisma.cashRegister.findFirst({
    where: { id: params.registerId, storeId: params.storeId, status: "closed", closeVerifiedAt: null },
    select: { id: true, closingCashCountId: true, closeVerifiedAt: true },
  });
  if (!register) return NextResponse.json({ error: "Register close not found or already verified" }, { status: 404 });
  if (!register.closingCashCountId) return NextResponse.json({ error: "Missing closing cash count" }, { status: 400 });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.cashCount.update({
      where: { id: register.closingCashCountId! },
      data: { verifiedByManagerId: auth.user.id, verifiedAt: now },
    });

    await tx.cashRegister.update({
      where: { id: register.id },
      data: { closeVerifiedByManagerId: auth.user.id, closeVerifiedAt: now },
    });
  });

  return NextResponse.json({ ok: true });
}

