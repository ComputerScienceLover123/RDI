import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import { prisma } from "@/lib/prisma";
import { canManagerViewStoreScanData } from "@/lib/store/scanDataAccess";
import StoreScanDataClient from "@/components/store/StoreScanDataClient";

export default async function StoreScanDataPage({ params }: { params: { storeId: string } }) {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/store");

  const { storeId } = params;
  if (!canManagerViewStoreScanData(user, storeId)) redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) redirect("/unauthorized");

  return <StoreScanDataClient storeId={store.id} storeName={store.name} />;
}
