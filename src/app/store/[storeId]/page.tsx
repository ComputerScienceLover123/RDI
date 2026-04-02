import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import { prisma } from "@/lib/prisma";
import StoreDashboard from "@/components/store/StoreDashboard";

export default async function StoreDetailPage({ params }: { params: { storeId: string } }) {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/store");

  const { storeId } = params;

  const allowed =
    user.role === "admin" ? true : user.assignedStoreId ? user.assignedStoreId === storeId : false;

  if (!allowed) redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) redirect("/unauthorized");

  const adminStores =
    user.role === "admin"
      ? await prisma.store.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : [];

  const canAudit = user.role === "admin" || user.role === "manager";

  return (
    <StoreDashboard
      storeId={store.id}
      storeName={store.name}
      userRole={user.role}
      canAudit={canAudit}
      adminStores={adminStores}
    />
  );
}
