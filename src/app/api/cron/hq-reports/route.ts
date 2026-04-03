import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredHqReports } from "@/lib/reports/generateAndSave";
import { runHqReportSchedulers } from "@/lib/reports/scheduler";

export const runtime = "nodejs";

/** Call from an external cron (e.g. daily) with Authorization: Bearer $CRON_SECRET */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });

  const auth = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (auth !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sched = await runHqReportSchedulers();
  const clean = await cleanupExpiredHqReports();

  return NextResponse.json({
    scheduledRuns: sched.ran,
    scheduleErrors: sched.errors,
    expiredDeleted: clean.deleted,
  });
}
