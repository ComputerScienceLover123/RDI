import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireCashStoreUser } from "@/lib/cash/routeAuth";
import { totalsFromDenoms } from "@/lib/cash/calc";

export const runtime = "nodejs";

const DenomSchema = z
  .object({
    hundreds: z.number().int().min(0).optional(),
    fifties: z.number().int().min(0).optional(),
    twenties: z.number().int().min(0).optional(),
    tens: z.number().int().min(0).optional(),
    fives: z.number().int().min(0).optional(),
    ones: z.number().int().min(0).optional(),
    quarters: z.number().int().min(0).optional(),
    dimes: z.number().int().min(0).optional(),
    nickels: z.number().int().min(0).optional(),
    pennies: z.number().int().min(0).optional(),
  })
  .strict();

const BodySchema = z.object({
  registerName: z.string().min(1).max(50),
  denominationBreakdown: DenomSchema,
  notes: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const auth = await requireCashStoreUser(params.storeId);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });

  const now = new Date();
  const { registerName, denominationBreakdown, notes } = parsed.data;

  const existingOpen = await prisma.cashRegister.findFirst({
    where: { storeId: params.storeId, registerName, status: "open" },
  });
  if (existingOpen) {
    return NextResponse.json({ error: `Register ${registerName} is already open.` }, { status: 409 });
  }

  const { billsTotal, coinsTotal, total } = totalsFromDenoms(denominationBreakdown);

  const result = await prisma.$transaction(async (tx) => {
    const register = await tx.cashRegister.create({
      data: {
        storeId: params.storeId,
        registerName,
        status: "open",
        openedByEmployeeId: auth.user.id,
        openedAt: now,
        openingCashAmount: total,
        currentExpectedCashAmount: total,
      },
    });

    const openCount = await tx.cashCount.create({
      data: {
        storeId: params.storeId,
        registerId: register.id,
        countType: "register_open",
        totalCountedAmount: total,
        countedByEmployeeId: auth.user.id,
        denominationBreakdown,
        coinsTotal,
        billsTotal,
        timestamp: now,
        notes: notes ?? null,
      },
    });

    await tx.cashRegister.update({
      where: { id: register.id },
      data: { openingCashCountId: openCount.id },
    });

    return { registerId: register.id };
  });

  return NextResponse.json({ ok: true, registerId: result.registerId });
}

