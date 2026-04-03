import { prisma } from "@/lib/prisma";
import { endOfLocalDay, formatLocalYMD, startOfLocalDay } from "@/lib/sales/dates";

export type DayCompliancePoint = {
  date: string;
  complianceRate: number | null;
  verificationCount: number;
  approvedCount: number;
  declinedCount: number;
  gapCount: number;
  hasComplianceGap: boolean;
};

export async function complianceLogsForRange(
  storeId: string,
  start: Date,
  end: Date
): Promise<{ approved: number; declined: number; total: number }> {
  const [approved, declined] = await Promise.all([
    prisma.ageVerificationLog.count({
      where: { storeId, verifiedAt: { gte: start, lte: end }, result: "approved" },
    }),
    prisma.ageVerificationLog.count({
      where: { storeId, verifiedAt: { gte: start, lte: end }, result: "declined" },
    }),
  ]);
  return { approved, declined, total: approved + declined };
}

export async function countAgeRestrictedGapsInRange(storeId: string, start: Date, end: Date): Promise<number> {
  return prisma.transactionLineItem.count({
    where: {
      product: { ageRestricted: true },
      ageVerificationLog: null,
      transaction: {
        storeId,
        type: "sale",
        transactionAt: { gte: start, lte: end },
      },
    },
  });
}

export async function countAgeRestrictedGapsForDay(storeId: string, day: Date): Promise<number> {
  return countAgeRestrictedGapsInRange(storeId, startOfLocalDay(day), endOfLocalDay(day));
}

export async function build30DayTrend(storeId: string, anchor: Date): Promise<DayCompliancePoint[]> {
  const points: DayCompliancePoint[] = [];
  for (let d = 29; d >= 0; d--) {
    const day = new Date(anchor);
    day.setDate(day.getDate() - d);
    const dayStart = startOfLocalDay(day);
    const dayEnd = endOfLocalDay(day);
    const ymd = formatLocalYMD(dayStart);

    const [approved, declined, gapCount] = await Promise.all([
      prisma.ageVerificationLog.count({
        where: { storeId, result: "approved", verifiedAt: { gte: dayStart, lte: dayEnd } },
      }),
      prisma.ageVerificationLog.count({
        where: { storeId, result: "declined", verifiedAt: { gte: dayStart, lte: dayEnd } },
      }),
      countAgeRestrictedGapsForDay(storeId, dayStart),
    ]);

    const verificationCount = approved + declined;
    const complianceRate =
      verificationCount > 0 ? Math.round((approved / verificationCount) * 10000) / 100 : null;

    points.push({
      date: ymd,
      complianceRate,
      verificationCount,
      approvedCount: approved,
      declinedCount: declined,
      gapCount,
      hasComplianceGap: gapCount > 0,
    });
  }
  return points;
}

export async function employeeScorecard(
  storeId: string,
  employeeId: string,
  start: Date,
  end: Date
): Promise<{
  ageRestrictedLineCount: number;
  approvedVerifications: number;
  declinedVerifications: number;
  gapCount: number;
  verificationRate: number | null;
}> {
  const ageRestrictedLineCount = await prisma.transactionLineItem.count({
    where: {
      product: { ageRestricted: true },
      transaction: {
        storeId,
        type: "sale",
        employeeId,
        transactionAt: { gte: start, lte: end },
      },
    },
  });

  const [approvedVerifications, declinedVerifications] = await Promise.all([
    prisma.ageVerificationLog.count({
      where: {
        storeId,
        employeeId,
        result: "approved",
        verifiedAt: { gte: start, lte: end },
      },
    }),
    prisma.ageVerificationLog.count({
      where: {
        storeId,
        employeeId,
        result: "declined",
        verifiedAt: { gte: start, lte: end },
      },
    }),
  ]);

  const gapCount = await prisma.transactionLineItem.count({
    where: {
      product: { ageRestricted: true },
      ageVerificationLog: null,
      transaction: {
        storeId,
        type: "sale",
        employeeId,
        transactionAt: { gte: start, lte: end },
      },
    },
  });

  const denom = approvedVerifications + declinedVerifications;
  const verificationRate = denom > 0 ? Math.round((approvedVerifications / denom) * 10000) / 100 : null;

  return {
    ageRestrictedLineCount,
    approvedVerifications,
    declinedVerifications,
    gapCount,
    verificationRate,
  };
}
