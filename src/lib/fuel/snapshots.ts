import { prisma } from "@/lib/prisma";
import { formatLocalYMD } from "@/lib/sales/dates";
import { utcNoonFromYmd } from "@/lib/fuel/dates";

/** Upsert today's volume snapshot for every tank at the store (for sales trend math). */
export async function recordTodaySnapshotsForStore(storeId: string): Promise<void> {
  const todayYmd = formatLocalYMD(new Date());
  const date = utcNoonFromYmd(todayYmd);
  const tanks = await prisma.fuelData.findMany({ where: { storeId } });
  for (const t of tanks) {
    await prisma.fuelDailyVolumeSnapshot.upsert({
      where: { fuelDataId_snapshotDate: { fuelDataId: t.id, snapshotDate: date } },
      create: {
        fuelDataId: t.id,
        snapshotDate: date,
        volumeGallons: t.currentVolumeGallons,
      },
      update: { volumeGallons: t.currentVolumeGallons },
    });
  }
}
