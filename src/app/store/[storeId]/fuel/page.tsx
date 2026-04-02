import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import { prisma } from "@/lib/prisma";
import { canViewFuel } from "@/lib/store/fuelAccess";
import FuelManagementClient from "@/components/store/FuelManagementClient";

export default async function StoreFuelPage({ params }: { params: { storeId: string } }) {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/store");

  const { storeId } = params;
  if (!canViewFuel(user, storeId)) redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) redirect("/unauthorized");

  const adminStores =
    user.role === "admin"
      ? await prisma.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : [];

  return (
    <FuelManagementClient
      storeId={store.id}
      storeName={store.name}
      userRole={user.role}
      adminStores={adminStores}
    />
  );
}
