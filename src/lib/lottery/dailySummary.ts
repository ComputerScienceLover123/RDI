import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { formatLocalYMD } from "@/lib/sales/dates";
import { utcNoonFromYmd } from "@/lib/fuel/dates";

function todaySummaryDate(): Date {
  return utcNoonFromYmd(formatLocalYMD(new Date()));
}

export async function recordLotteryPackActivated(storeId: string): Promise<void> {
  const summaryDate = todaySummaryDate();
  await prisma.lotteryDailySummary.upsert({
    where: { storeId_summaryDate: { storeId, summaryDate } },
    create: {
      storeId,
      summaryDate,
      totalPacksActivated: 1,
      totalPacksSettled: 0,
      totalExpectedRevenueSettled: new Prisma.Decimal(0),
      totalActualCollected: new Prisma.Decimal(0),
      totalOverShort: new Prisma.Decimal(0),
    },
    update: { totalPacksActivated: { increment: 1 } },
  });
}

export async function recordLotterySettlement(
  storeId: string,
  expected: Prisma.Decimal,
  actual: Prisma.Decimal,
  overShort: Prisma.Decimal,
): Promise<void> {
  const summaryDate = todaySummaryDate();
  const existing = await prisma.lotteryDailySummary.findUnique({
    where: { storeId_summaryDate: { storeId, summaryDate } },
  });
  if (!existing) {
    await prisma.lotteryDailySummary.create({
      data: {
        storeId,
        summaryDate,
        totalPacksActivated: 0,
        totalPacksSettled: 1,
        totalExpectedRevenueSettled: expected,
        totalActualCollected: actual,
        totalOverShort: overShort,
      },
    });
    return;
  }
  await prisma.lotteryDailySummary.update({
    where: { id: existing.id },
    data: {
      totalPacksSettled: { increment: 1 },
      totalExpectedRevenueSettled: existing.totalExpectedRevenueSettled.add(expected),
      totalActualCollected: existing.totalActualCollected.add(actual),
      totalOverShort: existing.totalOverShort.add(overShort),
    },
  });
}
