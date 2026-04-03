import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePosSimUser } from "@/lib/compliance/routeAuth";
import { ageAtInstant } from "@/lib/compliance/age";
import { z } from "zod";

export const runtime = "nodejs";

const TAX_RATE = new Prisma.Decimal("0.0825");

const VerificationSchema = z.object({
  method: z.enum(["visual_check", "id_scanned", "id_manual_entry"]),
  customerDob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  idType: z.enum(["drivers_license", "state_id", "passport", "military_id"]).optional().nullable(),
  /** When true, sale is blocked and logged as expired_id */
  expiredId: z.boolean().optional(),
  /** When true, sale is blocked and logged as no_id_present */
  noIdPresent: z.boolean().optional(),
});

const BodySchema = z.object({
  lineItems: z.array(
    z.object({
      productId: z.string().min(1),
      quantity: z.number().int().min(1).max(99),
    })
  ).min(1),
  paymentMethod: z.enum(["cash", "credit", "debit", "mobile"]),
  /** One entry per line item index; omit or null for non–age-restricted lines */
  verifications: z.array(VerificationSchema.nullable()).optional(),
});

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const auth = await requirePosSimUser(params.storeId);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }

  const { lineItems, paymentMethod, verifications } = parsed.data;
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(lineItems.map((l) => l.productId))] }, active: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));
  for (const li of lineItems) {
    if (!productMap.has(li.productId)) {
      return NextResponse.json({ error: `Unknown or inactive product: ${li.productId}` }, { status: 400 });
    }
  }

  const verifList = verifications ?? [];
  const now = new Date();
  const declinedPayloads: Array<{
    storeId: string;
    transactionId: null;
    lineItemId: null;
    productId: string;
    employeeId: string;
    method: "visual_check" | "id_scanned" | "id_manual_entry";
    customerDob: Date | null;
    customerAgeYears: number | null;
    idType: "drivers_license" | "state_id" | "passport" | "military_id" | null;
    result: "declined";
    declinedReason: "underage" | "expired_id" | "no_id_present";
    verifiedAt: Date;
  }> = [];

  type PreparedLine = {
    productId: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    taxEligible: boolean;
    product: (typeof products)[0];
  };

  const prepared: PreparedLine[] = [];
  for (let i = 0; i < lineItems.length; i++) {
    const row = lineItems[i]!;
    const p = productMap.get(row.productId)!;
    const unitPrice = p.retailPrice;
    const linePre = unitPrice.mul(new Prisma.Decimal(row.quantity));
    prepared.push({
      productId: row.productId,
      quantity: row.quantity,
      unitPrice,
      lineTotal: linePre,
      discountAmount: new Prisma.Decimal(0),
      taxEligible: p.taxEligible,
      product: p,
    });
  }

  for (let i = 0; i < prepared.length; i++) {
    const pl = prepared[i]!;
    if (!pl.product.ageRestricted) continue;

    const v = verifList[i] ?? null;
    if (!v) {
      return NextResponse.json(
        { error: `Age verification required for line ${i + 1} (${pl.product.name})` },
        { status: 400 }
      );
    }

    if (v.noIdPresent) {
      declinedPayloads.push({
        storeId: params.storeId,
        transactionId: null,
        lineItemId: null,
        productId: pl.productId,
        employeeId: auth.user.id,
        method: v.method,
        customerDob: null,
        customerAgeYears: null,
        idType: null,
        result: "declined",
        declinedReason: "no_id_present",
        verifiedAt: now,
      });
      continue;
    }

    if (v.expiredId) {
      declinedPayloads.push({
        storeId: params.storeId,
        transactionId: null,
        lineItemId: null,
        productId: pl.productId,
        employeeId: auth.user.id,
        method: v.method,
        customerDob: v.customerDob ? new Date(v.customerDob + "T12:00:00") : null,
        customerAgeYears: v.customerDob ? ageAtInstant(new Date(v.customerDob + "T12:00:00"), now) : null,
        idType: v.idType ?? null,
        result: "declined",
        declinedReason: "expired_id",
        verifiedAt: now,
      });
      continue;
    }

    if (!v.customerDob) {
      return NextResponse.json({ error: `Date of birth required for line ${i + 1}` }, { status: 400 });
    }
    if (!v.idType) {
      return NextResponse.json({ error: `ID type required for line ${i + 1}` }, { status: 400 });
    }

    const dob = new Date(v.customerDob + "T12:00:00");
    const age = ageAtInstant(dob, now);
    if (age < pl.product.minimumAge) {
      declinedPayloads.push({
        storeId: params.storeId,
        transactionId: null,
        lineItemId: null,
        productId: pl.productId,
        employeeId: auth.user.id,
        method: v.method,
        customerDob: dob,
        customerAgeYears: age,
        idType: v.idType,
        result: "declined",
        declinedReason: "underage",
        verifiedAt: now,
      });
      continue;
    }
  }

  const hasDeclined = declinedPayloads.length > 0;
  if (hasDeclined) {
    for (const row of declinedPayloads) {
      await prisma.ageVerificationLog.create({ data: row });
    }
    return NextResponse.json(
      {
        ok: false,
        blocked: true,
        message: "Sale blocked: one or more age-restricted items failed verification. Declined entries were logged.",
        declinedCount: declinedPayloads.length,
      },
      { status: 400 }
    );
  }

  let subtotal = new Prisma.Decimal(0);
  let taxable = new Prisma.Decimal(0);
  for (const pl of prepared) {
    subtotal = subtotal.add(pl.lineTotal);
    if (pl.taxEligible) taxable = taxable.add(pl.lineTotal);
  }
  const taxAmount = taxable.mul(TAX_RATE);
  const total = subtotal.add(taxAmount);

  const terminalId = `SIM-${params.storeId.slice(-6)}`;
  const verifoneReferenceId = `SIM-${now.getTime()}-${Math.random().toString(36).slice(2, 9)}`;

  const createdTxn = await prisma.$transaction(async (tx) => {
    const txn = await tx.posTransaction.create({
      data: {
        storeId: params.storeId,
        terminalId,
        type: "sale",
        subtotal,
        taxAmount,
        total,
        paymentMethod,
        verifoneReferenceId,
        employeeId: auth.user.id,
        transactionAt: now,
        lineItems: {
          create: prepared.map((pl) => ({
            productId: pl.productId,
            quantity: pl.quantity,
            unitPrice: pl.unitPrice,
            lineTotal: pl.lineTotal,
            discountAmount: pl.discountAmount,
          })),
        },
      },
    });

    const lines = await tx.transactionLineItem.findMany({
      where: { transactionId: txn.id },
      orderBy: { id: "asc" },
    });
    for (let i = 0; i < prepared.length; i++) {
      const pl = prepared[i]!;
      const v = verifList[i] ?? null;
      const line = lines[i]!;
      if (!pl.product.ageRestricted || !v) continue;

      await tx.ageVerificationLog.create({
        data: {
          storeId: params.storeId,
          transactionId: txn.id,
          lineItemId: line.id,
          productId: pl.productId,
          employeeId: auth.user.id,
          method: v.method,
          customerDob: v.customerDob ? new Date(v.customerDob + "T12:00:00") : null,
          customerAgeYears: v.customerDob ? ageAtInstant(new Date(v.customerDob + "T12:00:00"), now) : null,
          idType: v.idType ?? null,
          result: "approved",
          declinedReason: null,
          verifiedAt: now,
        },
      });
    }

    return txn;
  });

  return NextResponse.json({
    ok: true,
    transactionId: createdTxn.id,
    total: createdTxn.total.toString(),
    message: "Sale completed with age verification logged.",
  });
}
