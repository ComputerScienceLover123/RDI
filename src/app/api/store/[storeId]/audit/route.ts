import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAccessStore, canPerformInventoryAudit } from "@/lib/store/storeAccess";

export const runtime = "nodejs";

type AuditEntry = { productId: string; countedQuantity: number };

export async function POST(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  if (!canPerformInventoryAudit(user.role)) {
    return NextResponse.json({ error: "Only managers and admins can submit audits" }, { status: 403 });
  }

  const storeId = params.storeId;
  if (!canAccessStore(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { entries?: AuditEntry[]; notes?: string } | null;
  const entries = body?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "entries required" }, { status: 400 });
  }

  const notes = typeof body?.notes === "string" ? body.notes : undefined;

  const validated: Array<{ productId: string; counted: number }> = [];
  const seen = new Set<string>();
  for (const e of entries) {
    if (!e.productId || typeof e.countedQuantity !== "number" || !Number.isFinite(e.countedQuantity)) {
      return NextResponse.json({ error: "Each entry needs productId and countedQuantity" }, { status: 400 });
    }
    if (seen.has(e.productId)) {
      return NextResponse.json({ error: "Duplicate productId in audit entries" }, { status: 400 });
    }
    seen.add(e.productId);
    const counted = Math.round(e.countedQuantity);
    if (counted < 0) return NextResponse.json({ error: "Counted quantity cannot be negative" }, { status: 400 });
    validated.push({ productId: e.productId, counted });
  }

  const invRows = await prisma.inventory.findMany({
    where: {
      storeId,
      productId: { in: validated.map((v) => v.productId) },
    },
  });
  if (invRows.length !== validated.length) {
    return NextResponse.json({ error: "One or more products are not in this store inventory" }, { status: 400 });
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const v of validated) {
      const inv = invRows.find((r) => r.productId === v.productId)!;
      const systemQty = inv.quantityOnHand;
      const discrepancy = v.counted - systemQty;

      await tx.auditLog.create({
        data: {
          storeId,
          employeeId: user.id,
          productId: v.productId,
          systemQuantity: systemQty,
          countedQuantity: v.counted,
          discrepancyAmount: discrepancy,
          auditedAt: now,
          notes: notes ?? null,
        },
      });

      await tx.inventory.update({
        where: { id: inv.id },
        data: {
          quantityOnHand: v.counted,
          lastCountedAt: now,
        },
      });
    }
  });

  return NextResponse.json({ ok: true, audited: validated.length });
}
