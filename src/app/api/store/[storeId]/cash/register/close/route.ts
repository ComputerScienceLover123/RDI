import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCashStoreUser } from "@/lib/cash/routeAuth";
import { totalsFromDenoms, calcRegisterExpectedClosing } from "@/lib/cash/calc";

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
  registerId: z.string().min(1),
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
  const { registerId, denominationBreakdown, notes } = parsed.data;

  const register = await prisma.cashRegister.findFirst({
    where: { id: registerId, storeId: params.storeId, status: "open" },
  });
  if (!register) return NextResponse.json({ error: "Open register not found" }, { status: 404 });

  const { billsTotal, coinsTotal, total: closingTotal } = totalsFromDenoms(denominationBreakdown);

  const expected = await calcRegisterExpectedClosing({
    storeId: params.storeId,
    registerId,
    openedAt: register.openedAt,
    closedAt: now,
    openingCashAmount: register.openingCashAmount,
  });

  const expectedClosingAmount = expected.expectedClosingAmount;
  const overShortAmount = closingTotal.sub(expectedClosingAmount);
  const overShortAbs = Math.abs(overShortAmount.toNumber());

  const result = await prisma.$transaction(async (tx) => {
    const closeCount = await tx.cashCount.create({
      data: {
        storeId: params.storeId,
        registerId: register.id,
        countType: "register_close",
        totalCountedAmount: closingTotal,
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
      data: {
        status: "closed",
        closedByEmployeeId: auth.user.id,
        closedAt: now,
        closingCashCountId: closeCount.id,
        closingCashAmount: closingTotal,
        currentExpectedCashAmount: expectedClosingAmount,
        expectedClosingAmount,
        overShortAmount,
      },
    });

    return { closeCountId: closeCount.id };
  });

  let flag: "none" | "warning" | "critical" = "none";
  if (overShortAbs > 20) flag = "critical";
  else if (overShortAbs > 5) flag = "warning";

  return NextResponse.json({
    ok: true,
    registerId: register.id,
    closingCashAmount: closingTotal.toFixed(2),
    expectedClosingAmount: expectedClosingAmount.toFixed(2),
    overShortAmount: overShortAmount.toFixed(2),
    flag,
  });
}

