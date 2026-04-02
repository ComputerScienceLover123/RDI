import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import { canAccessStore } from "@/lib/store/storeAccess";
import CreatePurchaseOrderClient from "@/components/ordering/CreatePurchaseOrderClient";

export default async function NewPurchaseOrderPage({ params }: { params: { storeId: string } }) {
  const user = await getServerUser();
  if (!user) redirect(`/login?next=/store/${encodeURIComponent(params.storeId)}/ordering/new`);
  if (!canAccessStore(user, params.storeId)) redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");
  if (user.role === "employee") redirect(`/store/${encodeURIComponent(params.storeId)}/ordering`);

  return <CreatePurchaseOrderClient storeId={params.storeId} />;
}
