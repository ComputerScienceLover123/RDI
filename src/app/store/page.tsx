import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import { prisma } from "@/lib/prisma";

export default async function StoreIndexPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/store");
  if (user.forcePasswordChange) redirect("/password-change");

  const stores =
    user.role === "admin" ? await prisma.store.findMany({ orderBy: { createdAt: "asc" } }) : user.assignedStoreId
      ? await prisma.store.findMany({ where: { id: user.assignedStoreId } })
      : [];

  return (
    <main style={{ padding: 24, maxWidth: 900 }}>
      <h1>Your Stores</h1>
      <p style={{ opacity: 0.75 }}>
        Role: <code>{user.role}</code>
      </p>

      <div style={{ display: "grid", gap: 12, marginTop: 16, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        {stores.map((s) => (
          <div key={s.id} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
            <h3 style={{ marginTop: 0 }}>{s.name}</h3>
            <p style={{ margin: "4px 0 0" }}>
              Store ID: <code>{s.id}</code>
            </p>
            <p style={{ margin: "6px 0 0", opacity: 0.75 }}>{s.location ?? ""}</p>
            <p style={{ margin: "12px 0 0" }}>
              <Link href={`/store/${encodeURIComponent(s.id)}`}>Open</Link>
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}

