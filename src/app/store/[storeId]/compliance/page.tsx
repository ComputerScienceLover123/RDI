import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import { canAccessStore } from "@/lib/store/storeAccess";
import StoreComplianceClient from "@/components/store/StoreComplianceClient";

export default async function StoreCompliancePage({ params }: { params: { storeId: string } }) {
  const user = await getServerUser();
  if (!user) redirect(`/login?next=/store/${encodeURIComponent(params.storeId)}/compliance`);
  if (!canAccessStore(user, params.storeId)) redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  const mode = user.role === "employee" ? "employee" : "store";
  return <StoreComplianceClient storeId={params.storeId} mode={mode} />;
}
