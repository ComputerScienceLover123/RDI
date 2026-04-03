import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { parseLocalYMD } from "@/lib/sales/dates";

export const runtime = "nodejs";

const CreateSchema = z.object({
  programName: z.string().min(1),
  manufacturerName: z.string().min(1),
  rebateType: z.enum(["per_unit", "percentage"]),
  rebateValue: z.number().nonnegative(),
  paymentFrequency: z.enum(["weekly", "monthly", "quarterly"]),
  status: z.enum(["active", "paused", "expired"]).optional(),
  contactEmail: z.string().email(),
  enrollmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  productIds: z.array(z.string()).optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const programs = await prisma.scanDataProgram.findMany({
    orderBy: { programName: "asc" },
    include: {
      _count: { select: { products: true, submissions: true } },
    },
  });

  return NextResponse.json({
    programs: programs.map((p) => ({
      id: p.id,
      programName: p.programName,
      manufacturerName: p.manufacturerName,
      rebateType: p.rebateType,
      rebateValue: p.rebateValue.toString(),
      paymentFrequency: p.paymentFrequency,
      status: p.status,
      contactEmail: p.contactEmail,
      enrollmentDate: p.enrollmentDate.toISOString().slice(0, 10),
      productCount: p._count.products,
      submissionCount: p._count.submissions,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const d = parsed.data;
  const enr = parseLocalYMD(d.enrollmentDate);
  if (!enr) return NextResponse.json({ error: "Invalid enrollment date" }, { status: 400 });
  if (d.rebateType === "percentage" && d.rebateValue > 100) {
    return NextResponse.json({ error: "Percentage rebate cannot exceed 100" }, { status: 400 });
  }

  const program = await prisma.scanDataProgram.create({
    data: {
      programName: d.programName,
      manufacturerName: d.manufacturerName,
      rebateType: d.rebateType,
      rebateValue: new Prisma.Decimal(d.rebateValue),
      paymentFrequency: d.paymentFrequency,
      status: d.status ?? "active",
      contactEmail: d.contactEmail,
      enrollmentDate: enr,
      products:
        d.productIds && d.productIds.length > 0 ?
          { create: [...new Set(d.productIds)].map((productId) => ({ productId })) }
        : undefined,
    },
  });

  return NextResponse.json({ id: program.id });
}
