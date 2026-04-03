import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCashVerifier } from "@/lib/cash/routeAuth";
import { totalsFromDenoms, calcSafeExpectedBalance } from "@/lib/cash/calc";

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
  denominationBreakdown: DenomSchema,
  notes: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const auth = await requireCashVerifier(params.storeId);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const now = new Date();
  const { denominationBreakdown, notes } = parsed.data;

  const { expectedSafeBalance } = await calcSafeExpectedBalance({ storeId: params.storeId, safeCountAt: now });
  const { billsTotal, coinsTotal, total } = totalsFromDenoms(denominationBreakdown);

  const safeMismatch = total.sub(expectedSafeBalance);
  const safeMismatchAbs = Math.abs(safeMismatch.toNumber());

  const count = await prisma.cashCount.create({
    data: {
      storeId: params.storeId,
      registerId: null,
      countType: "safe_count",
      totalCountedAmount: total,
      countedByEmployeeId: auth.user.id,
      denominationBreakdown,
      coinsTotal,
      billsTotal,
      verifiedByManagerId: auth.user.id,
      verifiedAt: now,
      timestamp: now,
      notes: notes ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    safeCountId: count.id,
    countedSafeBalance: total.toFixed(2),
    expectedSafeBalance: expectedSafeBalance.toFixed(2),
    safeMismatchAmount: safeMismatch.toFixed(2),
    flag: safeMismatchAbs > 25 ? "warning" : "none",
  });
}

