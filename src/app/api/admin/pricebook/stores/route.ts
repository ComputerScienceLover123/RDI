import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const stores = await prisma.store.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json({ stores });
}
