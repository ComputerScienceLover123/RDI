import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import { canAccessStore } from "@/lib/store/storeAccess";
import PurchaseOrderListClient from "@/components/ordering/PurchaseOrderListClient";

export default async function StoreOrderingPage({ params }: { params: { storeId: string } }) {
  const user = await getServerUser();
  if (!user) redirect(`/login?next=/store/${encodeURIComponent(params.storeId)}/ordering`);
  if (!canAccessStore(user, params.storeId)) redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  const canManage = user.role === "admin" || user.role === "manager";

  return <PurchaseOrderListClient storeId={params.storeId} canManage={canManage} />;
}
