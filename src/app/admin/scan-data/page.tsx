import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import AdminScanDataClient from "@/components/admin/AdminScanDataClient";

export default async function AdminScanDataPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/admin/scan-data");
  if (user.role !== "admin") redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  return <AdminScanDataClient />;
}
