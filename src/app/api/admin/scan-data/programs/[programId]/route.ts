import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { parseLocalYMD } from "@/lib/sales/dates";

export const runtime = "nodejs";

const PatchSchema = z
  .object({
    programName: z.string().min(1).optional(),
    manufacturerName: z.string().min(1).optional(),
    rebateType: z.enum(["per_unit", "percentage"]).optional(),
    rebateValue: z.number().nonnegative().optional(),
    paymentFrequency: z.enum(["weekly", "monthly", "quarterly"]).optional(),
    status: z.enum(["active", "paused", "expired"]).optional(),
    contactEmail: z.string().email().optional(),
    enrollmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict();

export async function GET(_req: NextRequest, { params }: { params: { programId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const p = await prisma.scanDataProgram.findUnique({
    where: { id: params.programId },
    include: {
      products: { include: { product: { select: { id: true, upc: true, name: true, retailPrice: true } } } },
    },
  });
  if (!p) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: p.id,
    programName: p.programName,
    manufacturerName: p.manufacturerName,
    rebateType: p.rebateType,
    rebateValue: p.rebateValue.toString(),
    paymentFrequency: p.paymentFrequency,
    status: p.status,
    contactEmail: p.contactEmail,
    enrollmentDate: p.enrollmentDate.toISOString().slice(0, 10),
    products: p.products.map((x) => ({
      productId: x.productId,
      upc: x.product.upc,
      name: x.product.name,
      retailPrice: x.product.retailPrice.toString(),
    })),
  });
}

export async function PATCH(req: NextRequest, { params }: { params: { programId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const d = parsed.data;
  if (d.rebateValue != null) {
    const existing = await prisma.scanDataProgram.findUnique({ where: { id: params.programId } });
    const rt = d.rebateType ?? existing?.rebateType;
    if (rt === "percentage" && d.rebateValue > 100) {
      return NextResponse.json({ error: "Percentage rebate cannot exceed 100" }, { status: 400 });
    }
  }

  const data: Prisma.ScanDataProgramUpdateInput = {};
  if (d.programName != null) data.programName = d.programName;
  if (d.manufacturerName != null) data.manufacturerName = d.manufacturerName;
  if (d.rebateType != null) data.rebateType = d.rebateType;
  if (d.rebateValue != null) data.rebateValue = new Prisma.Decimal(d.rebateValue);
  if (d.paymentFrequency != null) data.paymentFrequency = d.paymentFrequency;
  if (d.status != null) data.status = d.status;
  if (d.contactEmail != null) data.contactEmail = d.contactEmail;
  if (d.enrollmentDate != null) {
    const enr = parseLocalYMD(d.enrollmentDate);
    if (!enr) return NextResponse.json({ error: "Invalid enrollment date" }, { status: 400 });
    data.enrollmentDate = enr;
  }

  await prisma.scanDataProgram.update({
    where: { id: params.programId },
    data,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { programId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  await prisma.scanDataProgram.delete({ where: { id: params.programId } });
  return NextResponse.json({ ok: true });
}
