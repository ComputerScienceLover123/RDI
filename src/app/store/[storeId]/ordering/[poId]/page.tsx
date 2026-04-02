import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import { canAccessStore } from "@/lib/store/storeAccess";
import PurchaseOrderDetailClient from "@/components/ordering/PurchaseOrderDetailClient";

export default async function PurchaseOrderDetailPage({ params }: { params: { storeId: string; poId: string } }) {
  const user = await getServerUser();
  if (!user) redirect(`/login?next=/store/${encodeURIComponent(params.storeId)}/ordering/${params.poId}`);
  if (!canAccessStore(user, params.storeId)) redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  return <PurchaseOrderDetailClient storeId={params.storeId} poId={params.poId} />;
}
