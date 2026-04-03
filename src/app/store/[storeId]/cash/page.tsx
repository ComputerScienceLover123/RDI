import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import { canAccessStore } from "@/lib/store/storeAccess";
import CashManagementClient from "@/components/store/CashManagementClient";

export default async function StoreCashPage({ params }: { params: { storeId: string } }) {
  const user = await getServerUser();
  if (!user) redirect(`/login?next=/store/${encodeURIComponent(params.storeId)}/cash`);
  if (!canAccessStore(user, params.storeId)) redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  return <CashManagementClient storeId={params.storeId} />;
}

