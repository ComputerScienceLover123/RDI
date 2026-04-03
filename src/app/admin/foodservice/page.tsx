import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import { canAdminFoodservice } from "@/lib/store/foodserviceAccess";
import AdminFoodserviceClient from "@/components/admin/AdminFoodserviceClient";

export default async function AdminFoodservicePage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/admin/foodservice");
  if (!canAdminFoodservice(user)) redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  return <AdminFoodserviceClient />;
}
