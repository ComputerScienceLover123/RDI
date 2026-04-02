import { getSessionClaims } from "@/lib/auth/session.server";
import { redirect } from "next/navigation";
import PasswordChangeForm from "@/components/auth/PasswordChangeForm";

export default async function PasswordChangePage() {
  const claims = await getSessionClaims();
  if (!claims) redirect(`/login?next=/password-change`);
  if (!claims.forcePasswordChange) redirect("/store");

  return (
    <main style={{ padding: 24, maxWidth: 520 }}>
      <h1>Change Password</h1>
      <p style={{ opacity: 0.75 }}>
        Your temporary password must be updated before accessing the system.
      </p>
      <PasswordChangeForm />
    </main>
  );
}

