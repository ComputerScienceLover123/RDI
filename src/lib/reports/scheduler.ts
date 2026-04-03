import type { HqReportScheduleFrequency } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAdminUserIds } from "@/lib/alerts/recipients";
import { categoryAllowedByPreference, getOrCreateNotificationPreferences } from "@/lib/alerts/preferences";
import { resolveDatePreset } from "@/lib/reports/presets";
import { resolveStoreIds } from "@/lib/reports/resolveStores";
import { generateAndSaveHqReport } from "@/lib/reports/generateAndSave";
import { startOfLocalDay } from "@/lib/sales/dates";

function shouldRunSchedule(freq: HqReportScheduleFrequency, last: Date | null, now: Date): boolean {
  const d = startOfLocalDay(now);
  if (freq === "daily") {
    if (!last) return true;
    return startOfLocalDay(last).getTime() < d.getTime();
  }
  if (freq === "weekly_monday") {
    if (d.getDay() !== 1) return false;
    if (!last) return true;
    return startOfLocalDay(last).getTime() < d.getTime();
  }
  if (freq === "monthly_first") {
    if (d.getDate() !== 1) return false;
    if (!last) return true;
    return startOfLocalDay(last).getTime() < d.getTime();
  }
  return false;
}

export async function runHqReportSchedulers(): Promise<{ ran: number; errors: string[] }> {
  const now = new Date();
  const schedules = await prisma.hqReportSchedule.findMany({
    where: { enabled: true },
    include: { template: true },
  });

  let ran = 0;
  const errors: string[] = [];

  for (const s of schedules) {
    if (!shouldRunSchedule(s.frequency, s.lastRunAt, now)) continue;

    const t = s.template;
    const range = resolveDatePreset(t.datePreset, t.customDateFrom ?? undefined, t.customDateTo ?? undefined, now);
    if ("error" in range) {
      errors.push(`Template ${t.id}: ${range.error}`);
      continue;
    }

    const stores = await resolveStoreIds(t.storeScope, t.storeIds);
    if ("error" in stores) {
      errors.push(`Template ${t.id}: ${stores.error}`);
      continue;
    }

    const gen = await generateAndSaveHqReport({
      reportType: t.reportType,
      storeIds: stores,
      range,
      generatedById: t.createdById,
      displayName: `${t.name} (scheduled)`,
    });

    if ("error" in gen) {
      errors.push(gen.error);
      continue;
    }

    await prisma.hqReportSchedule.update({
      where: { id: s.id },
      data: { lastRunAt: now },
    });

    const admins = await getAdminUserIds();
    for (const uid of admins) {
      const prefs = await getOrCreateNotificationPreferences(uid);
      if (!categoryAllowedByPreference(prefs, "reporting")) continue;
      await prisma.notification.create({
        data: {
          storeId: null,
          recipientUserId: uid,
          title: "Scheduled report ready",
          description: `Your report "${t.name}" has been generated. Open HQ Reports to download.`,
          severity: "info",
          category: "reporting",
          linkUrl: "/admin/reports",
          dedupeKey: `hq_sched:${gen.id}:${uid}`,
        },
      });
    }

    ran++;
  }

  return { ran, errors };
}
