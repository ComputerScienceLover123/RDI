import Link from "next/link";
import { redirect } from "next/navigation";
import PricebookProductDetailClient from "@/components/admin/PricebookProductDetailClient";
import { getServerUser } from "@/lib/auth/serverUser";

export default async function AdminPricebookProductPage({ params }: { params: { productId: string } }) {
  const user = await getServerUser();
  if (!user) redirect(`/login?next=/admin/pricebook/${encodeURIComponent(params.productId)}`);
  if (user.role !== "admin") redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  return <PricebookProductDetailClient productId={params.productId} />;
}
