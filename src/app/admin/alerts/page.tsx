import Link from "next/link";
import { redirect } from "next/navigation";
import AdminAlertsClient from "@/components/admin/AdminAlertsClient";
import { getServerUser } from "@/lib/auth/serverUser";

export default async function AdminAlertsPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/admin/alerts");
  if (user.role !== "admin") redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/store" style={{ color: "#2563eb" }}>
          ← Stores
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Admin: Alerts &amp; notifications</h1>
      <p style={{ opacity: 0.8 }}>
        Chain-wide view of generated notifications. Signed in as <code>{user.email}</code>
      </p>
      <AdminAlertsClient />
    </main>
  );
}
