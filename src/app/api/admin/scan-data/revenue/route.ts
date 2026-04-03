import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/adminAuth";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const paid = await prisma.scanDataSubmission.findMany({
    where: {
      status: "paid",
      paymentReceivedAt: { not: null },
      paymentAmountReceived: { not: null },
    },
    select: {
      paymentReceivedAt: true,
      paymentAmountReceived: true,
      programId: true,
      program: { select: { programName: true } },
    },
  });

  const monthMap = new Map<string, Map<string, { programName: string; amount: number }>>();
  for (const r of paid) {
    if (!r.paymentReceivedAt || !r.paymentAmountReceived) continue;
    const d = r.paymentReceivedAt;
    if (d < start) continue;
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap.has(mk)) monthMap.set(mk, new Map());
    const pm = monthMap.get(mk)!;
    const amt = Number(r.paymentAmountReceived);
    const cur = pm.get(r.programId);
    if (!cur) pm.set(r.programId, { programName: r.program.programName, amount: amt });
    else cur.amount += amt;
  }

  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const dt = new Date(start.getFullYear(), start.getMonth() + i, 1);
    months.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`);
  }

  const series = months.map((mk) => {
    const programs = monthMap.get(mk);
    const byProgram: Array<{ programId: string; programName: string; amount: number }> = [];
    let total = 0;
    if (programs) {
      for (const [programId, v] of programs) {
        byProgram.push({
          programId,
          programName: v.programName,
          amount: Math.round(v.amount * 100) / 100,
        });
        total += v.amount;
      }
    }
    return { month: mk, total: Math.round(total * 100) / 100, byProgram };
  });

  const y = now.getFullYear();
  const ytdStart = new Date(y, 0, 1);
  let ytd = 0;
  let priorYtd = 0;
  const py = y - 1;

  for (const r of paid) {
    if (!r.paymentReceivedAt || !r.paymentAmountReceived) continue;
    const d = r.paymentReceivedAt;
    const amt = Number(r.paymentAmountReceived);
    if (d >= ytdStart && d.getFullYear() === y) ytd += amt;
    if (
      d.getFullYear() === py &&
      d >= new Date(py, 0, 1) &&
      d <= new Date(py, now.getMonth(), now.getDate())
    ) {
      priorYtd += amt;
    }
  }

  return NextResponse.json({
    months: series,
    yearToDate: Math.round(ytd * 100) / 100,
    priorYearToDateComparable: Math.round(priorYtd * 100) / 100,
  });
}
