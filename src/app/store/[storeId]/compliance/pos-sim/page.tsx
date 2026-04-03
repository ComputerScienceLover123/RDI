import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import { canAccessStore } from "@/lib/store/storeAccess";
import { canUseCompliancePosSim } from "@/lib/compliance/access";
import PosSimClient from "@/components/store/PosSimClient";

export default async function PosSimPage({ params }: { params: { storeId: string } }) {
  const user = await getServerUser();
  if (!user) redirect(`/login?next=/store/${encodeURIComponent(params.storeId)}/compliance/pos-sim`);
  if (!canAccessStore(user, params.storeId)) redirect("/unauthorized");
  if (!canUseCompliancePosSim(user, params.storeId)) redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  return <PosSimClient storeId={params.storeId} />;
}
