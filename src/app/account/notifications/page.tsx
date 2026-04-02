import Link from "next/link";
import { redirect } from "next/navigation";
import NotificationPreferencesClient from "@/components/account/NotificationPreferencesClient";
import { getServerUser } from "@/lib/auth/serverUser";

export default async function AccountNotificationPreferencesPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/account/notifications");
  if (user.forcePasswordChange) redirect("/password-change");

  return (
    <main style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/store" style={{ color: "#2563eb" }}>
          ← Stores
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Alert preferences</h1>
      <p style={{ opacity: 0.8 }}>
        Signed in as <code>{user.email}</code>
      </p>
      <NotificationPreferencesClient />
    </main>
  );
}
