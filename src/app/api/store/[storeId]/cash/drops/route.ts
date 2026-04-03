import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCashStoreUser } from "@/lib/cash/routeAuth";
import { calcRegisterExpectedClosing } from "@/lib/cash/calc";

export const runtime = "nodejs";

const BodySchema = z.object({
  registerId: z.string().min(1),
  dropType: z.enum(["safe_drop", "bank_deposit", "change_order_received"]),
  amountDropped: z.number().nonnegative(),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const auth = await requireCashStoreUser(params.storeId);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { registerId, dropType, amountDropped, notes } = parsed.data;

  if (auth.user.role === "employee" && dropType !== "safe_drop") {
    return NextResponse.json({ error: "Employees can only log safe drops." }, { status: 403 });
  }

  const register = await prisma.cashRegister.findFirst({
    where: { id: registerId, storeId: params.storeId, status: "open" },
    select: { id: true, openedAt: true, openingCashAmount: true },
  });
  if (!register) return NextResponse.json({ error: "Open register not found" }, { status: 404 });

  const amount = new Prisma.Decimal(amountDropped.toFixed(2));
  const now = new Date();
  const drop = await prisma.cashDrop.create({
    data: {
      storeId: params.storeId,
      registerId: register.id,
      dropType,
      amountDropped: amount,
      employeeId: auth.user.id,
      notes: notes ?? null,
      droppedAt: now,
    },
  });

  // Keep `currentExpectedCashAmount` in sync (includes cash sales/refunds + safe drops up to "now").
  const expected = await calcRegisterExpectedClosing({
    storeId: params.storeId,
    registerId: register.id,
    openedAt: register.openedAt,
    closedAt: now,
    openingCashAmount: register.openingCashAmount,
  });

  await prisma.cashRegister.update({
    where: { id: register.id },
    data: { currentExpectedCashAmount: expected.expectedClosingAmount },
  });

  return NextResponse.json({ ok: true, dropId: drop.id });
}

