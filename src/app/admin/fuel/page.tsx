import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import AdminFuelClient from "@/components/admin/AdminFuelClient";

export default async function AdminFuelPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/admin/fuel");
  if (user.role !== "admin") redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  return <AdminFuelClient />;
}
