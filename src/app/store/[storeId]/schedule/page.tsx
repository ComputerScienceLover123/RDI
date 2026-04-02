import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import { prisma } from "@/lib/prisma";
import { canViewSchedule } from "@/lib/store/scheduleAccess";
import ScheduleClient from "@/components/store/ScheduleClient";

export default async function StoreSchedulePage({ params }: { params: { storeId: string } }) {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/store");

  const { storeId } = params;

  if (!canViewSchedule(user, storeId)) redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) redirect("/unauthorized");

  const adminStores =
    user.role === "admin"
      ? await prisma.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : [];

  return (
    <ScheduleClient
      storeId={store.id}
      storeName={store.name}
      userRole={user.role}
      adminStores={adminStores}
    />
  );
}
