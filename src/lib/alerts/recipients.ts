import { prisma } from "@/lib/prisma";

/** Active admins (all stores) and managers assigned to the store. */
export async function getManagerAdminUserIdsForStore(storeId: string): Promise<string[]> {
  const [admins, managers] = await Promise.all([
    prisma.user.findMany({
      where: { role: "admin", accountStatus: "active" },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: { role: "manager", assignedStoreId: storeId, accountStatus: "active" },
      select: { id: true },
    }),
  ]);
  const ids = new Set<string>();
  for (const u of admins) ids.add(u.id);
  for (const u of managers) ids.add(u.id);
  return [...ids];
}

/** Managers only at the store (for PO / audit reminders). */
export async function getManagerUserIdsForStore(storeId: string): Promise<string[]> {
  const managers = await prisma.user.findMany({
    where: { role: "manager", assignedStoreId: storeId, accountStatus: "active" },
    select: { id: true },
  });
  return managers.map((m) => m.id);
}
