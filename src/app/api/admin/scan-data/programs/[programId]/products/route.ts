import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";

export const runtime = "nodejs";

const PostSchema = z.object({ productId: z.string().min(1) });

export async function POST(req: NextRequest, { params }: { params: { programId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = PostSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const prog = await prisma.scanDataProgram.findUnique({ where: { id: params.programId } });
  if (!prog) return NextResponse.json({ error: "Program not found" }, { status: 404 });

  const product = await prisma.product.findUnique({ where: { id: parsed.data.productId } });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  await prisma.scanDataProgramProduct.upsert({
    where: { programId_productId: { programId: params.programId, productId: parsed.data.productId } },
    create: { programId: params.programId, productId: parsed.data.productId },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { programId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const productId = req.nextUrl.searchParams.get("productId")?.trim();
  if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 });

  await prisma.scanDataProgramProduct.deleteMany({
    where: { programId: params.programId, productId },
  });

  return NextResponse.json({ ok: true });
}
