import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import AdminUsersPanel from "@/components/admin/AdminUsersPanel";

export default async function AdminUsersPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/admin/users");
  if (user.role !== "admin") redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Admin: Manage Users</h1>
      <p style={{ opacity: 0.75 }}>
        Signed in as <code>{user.email}</code>
      </p>
      <AdminUsersPanel />
    </main>
  );
}

