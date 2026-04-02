import { prisma } from "@/lib/prisma";
import { lastNDatesLocal, utcNoonFromYmd, ymdFromDbDate } from "@/lib/fuel/dates";

export type FuelSalesTrendPoint = { date: string; gallons: number };

/**
 * Estimated store-wide gallons sold per local calendar day:
 * sum over tanks of (volume_prev_day + deliveries_that_day - volume_that_day)
 * when both snapshots exist for that tank.
 */
export async function buildStoreFuelSalesTrend(
  storeId: string,
  numDays: number,
): Promise<FuelSalesTrendPoint[]> {
  const tanks = await prisma.fuelData.findMany({ where: { storeId }, select: { id: true } });
  const ids = tanks.map((t) => t.id);
  const dates = lastNDatesLocal(numDays);
  if (ids.length === 0) {
    return dates.map((date) => ({ date, gallons: 0 }));
  }

  const from = utcNoonFromYmd(dates[0]!);
  const to = utcNoonFromYmd(dates[dates.length - 1]!);

  const [snaps, dels] = await Promise.all([
    prisma.fuelDailyVolumeSnapshot.findMany({
      where: { fuelDataId: { in: ids }, snapshotDate: { gte: from, lte: to } },
    }),
    prisma.fuelDelivery.findMany({
      where: { storeId, deliveryDate: { gte: from, lte: to } },
      select: { fuelDataId: true, deliveryDate: true, volumeGallons: true },
    }),
  ]);

  const snapMap = new Map<string, number>();
  for (const s of snaps) {
    const ymd = ymdFromDbDate(s.snapshotDate);
    snapMap.set(`${s.fuelDataId}|${ymd}`, Number(s.volumeGallons));
  }

  const delMap = new Map<string, number>();
  for (const x of dels) {
    const ymd = ymdFromDbDate(x.deliveryDate);
    const k = `${x.fuelDataId}|${ymd}`;
    delMap.set(k, (delMap.get(k) ?? 0) + Number(x.volumeGallons));
  }

  const result: FuelSalesTrendPoint[] = [];
  for (let i = 0; i < dates.length; i++) {
    const currYmd = dates[i]!;
    if (i === 0) {
      result.push({ date: currYmd, gallons: 0 });
      continue;
    }
    const prevYmd = dates[i - 1]!;
    let total = 0;
    for (const id of ids) {
      const v0 = snapMap.get(`${id}|${prevYmd}`);
      const v1 = snapMap.get(`${id}|${currYmd}`);
      if (v0 === undefined || v1 === undefined) continue;
      const del = delMap.get(`${id}|${currYmd}`) ?? 0;
      const sold = v0 + del - v1;
      if (sold > 0) total += sold;
    }
    result.push({ date: currYmd, gallons: Math.round(total * 10) / 10 });
  }
  return result;
}
