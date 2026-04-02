import { redirect } from "next/navigation";
import PricebookClient from "@/components/admin/PricebookClient";
import { getServerUser } from "@/lib/auth/serverUser";

export default async function AdminPricebookPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/admin/pricebook");
  if (user.role !== "admin") redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  return <PricebookClient />;
}
