import { prisma } from "@/lib/prisma";
import { formatLocalYMD, parseLocalYMD, startOfLocalDay } from "@/lib/sales/dates";
import { utcNoonFromYmd, ymdFromDbDate } from "@/lib/fuel/dates";

/** Gallons sold per tank in date range (needs snapshots for consecutive days). */
export async function fuelGallonsSoldByTankInRange(
  storeId: string,
  fromYmd: string,
  toYmd: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const tanks = await prisma.fuelData.findMany({ where: { storeId }, select: { id: true } });
  const ids = tanks.map((t) => t.id);
  if (ids.length === 0) return out;

  const startD = parseLocalYMD(fromYmd);
  const endD = parseLocalYMD(toYmd);
  if (!startD || !endD) return out;

  const dates: string[] = [];
  for (let d = new Date(startD); d.getTime() <= endD.getTime(); d.setDate(d.getDate() + 1)) {
    dates.push(formatLocalYMD(d));
  }
  if (dates.length < 2) return out;

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

  for (let i = 1; i < dates.length; i++) {
    const prevYmd = dates[i - 1]!;
    const currYmd = dates[i]!;
    for (const id of ids) {
      const v0 = snapMap.get(`${id}|${prevYmd}`);
      const v1 = snapMap.get(`${id}|${currYmd}`);
      if (v0 === undefined || v1 === undefined) continue;
      const del = delMap.get(`${id}|${currYmd}`) ?? 0;
      const sold = v0 + del - v1;
      if (sold > 0) {
        out.set(id, (out.get(id) ?? 0) + sold);
      }
    }
  }

  return out;
}
