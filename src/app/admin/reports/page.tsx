import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import AdminReportsClient from "@/components/admin/AdminReportsClient";

export default async function AdminReportsPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/admin/reports");
  if (user.role !== "admin") redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  return <AdminReportsClient />;
}
