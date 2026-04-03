import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";
import { getAdminUserIds } from "@/lib/alerts/recipients";
import { categoryAllowedByPreference, getOrCreateNotificationPreferences } from "@/lib/alerts/preferences";
import { parseLocalYMD } from "@/lib/sales/dates";

export const runtime = "nodejs";

const PatchSchema = z
  .object({
    status: z.enum(["pending", "submitted", "confirmed", "paid"]).optional(),
    submittedAt: z.string().datetime().optional().nullable(),
    paymentReceivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
    paymentAmountReceived: z.number().nonnegative().optional().nullable(),
  })
  .strict();

export async function PATCH(req: NextRequest, { params }: { params: { submissionId: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const d = parsed.data;

  const existing = await prisma.scanDataSubmission.findUnique({
    where: { id: params.submissionId },
    include: { program: { select: { programName: true } }, store: { select: { name: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data: Prisma.ScanDataSubmissionUpdateInput = {};
  if (d.status != null) data.status = d.status;
  if (d.submittedAt !== undefined) data.submittedAt = d.submittedAt ? new Date(d.submittedAt) : null;
  if (d.paymentReceivedAt !== undefined) {
    data.paymentReceivedAt = d.paymentReceivedAt ? parseLocalYMD(d.paymentReceivedAt) : null;
  }
  if (d.paymentAmountReceived !== undefined) {
    data.paymentAmountReceived =
      d.paymentAmountReceived != null ? new Prisma.Decimal(d.paymentAmountReceived) : null;
  }

  const updated = await prisma.scanDataSubmission.update({
    where: { id: params.submissionId },
    data,
    include: { program: { select: { programName: true } }, store: { select: { name: true } } },
  });

  const wasIncomplete = existing.paymentReceivedAt == null || existing.paymentAmountReceived == null;
  const nowComplete = updated.paymentReceivedAt != null && updated.paymentAmountReceived != null;

  if (wasIncomplete && nowComplete) {
    const adminIds = await getAdminUserIds();
    const expected = Number(updated.totalRebateValueCalculated);
    const paid = Number(updated.paymentAmountReceived ?? 0);
    const mismatch = Math.abs(paid - expected) > 0.02;

    for (const uid of adminIds) {
      const prefs = await getOrCreateNotificationPreferences(uid);
      if (!categoryAllowedByPreference(prefs, "scan_data")) continue;
      const dk = `scan_pay:${updated.id}:${uid}`;
      const exists = await prisma.notification.findFirst({ where: { recipientUserId: uid, dedupeKey: dk } });
      if (exists) continue;
      await prisma.notification.create({
        data: {
          storeId: updated.storeId,
          recipientUserId: uid,
          title: `Scan data payment received — ${updated.program.programName}`,
          description: `${updated.store.name}: payment $${paid.toFixed(2)} recorded${mismatch ? ` (differs from calculated $${expected.toFixed(2)})` : ""}.`,
          severity: "info",
          category: "scan_data",
          linkUrl: "/admin/scan-data",
          dedupeKey: dk,
        },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
