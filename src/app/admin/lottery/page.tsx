import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import AdminLotteryClient from "@/components/admin/AdminLotteryClient";

export default async function AdminLotteryPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/admin/lottery");
  if (user.role !== "admin") redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  return <AdminLotteryClient />;
}
