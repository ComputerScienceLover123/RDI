import { redirect } from "next/navigation";
import AdminCashClient from "@/components/admin/AdminCashClient";
import { getServerUser } from "@/lib/auth/serverUser";

export default async function AdminCashPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/admin/cash");
  if (user.role !== "admin") redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  return <AdminCashClient />;
}

