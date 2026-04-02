import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import InventorySection from "@/components/store/InventorySection";
import OrdersSection from "@/components/store/OrdersSection";
import { prisma } from "@/lib/prisma";

export default async function StoreDetailPage({ params }: { params: { storeId: string } }) {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/store");

  const { storeId } = params;

  const allowed =
    user.role === "admin" ? true : user.assignedStoreId ? user.assignedStoreId === storeId : false;

  if (!allowed) redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) redirect("/unauthorized");

  return (
    <main style={{ padding: 24, maxWidth: 980 }}>
      <h1>{store.name}</h1>
      <p style={{ opacity: 0.75 }}>
        Store ID: <code>{store.id}</code> · Role: <code>{user.role}</code>
      </p>

      <section style={{ marginTop: 24 }}>
        <h2>Inventory</h2>
        <InventorySection storeId={store.id} role={user.role} />
      </section>

      <section style={{ marginTop: 24 }}>
        <h2>Ordering</h2>
        <OrdersSection storeId={store.id} role={user.role} />
      </section>
    </main>
  );
}

