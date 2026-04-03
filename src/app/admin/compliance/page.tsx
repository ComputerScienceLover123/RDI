import { redirect } from "next/navigation";
import AdminComplianceClient from "@/components/admin/AdminComplianceClient";
import { getServerUser } from "@/lib/auth/serverUser";

export default async function AdminCompliancePage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/admin/compliance");
  if (user.role !== "admin") redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  return <AdminComplianceClient />;
}
