import dynamic from "next/dynamic";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import { prisma } from "@/lib/prisma";
import { canAccessStore } from "@/lib/store/storeAccess";

const SalesDashboardClient = dynamic(() => import("@/components/sales/SalesDashboardClient"), {
  ssr: false,
  loading: () => (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <p style={{ opacity: 0.8 }}>Loading sales dashboard…</p>
    </main>
  ),
});

export default async function StoreSalesPage({ params }: { params: { storeId: string } }) {
  const user = await getServerUser();
  if (!user) redirect(`/login?next=/store/${encodeURIComponent(params.storeId)}/sales`);
  if (!canAccessStore(user, params.storeId)) redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  const store = await prisma.store.findUnique({ where: { id: params.storeId } });
  if (!store) redirect("/unauthorized");

  return <SalesDashboardClient storeId={store.id} storeName={store.name} userRole={user.role} />;
}
