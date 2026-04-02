import MfaSetupPanel from "@/components/auth/MfaSetupPanel";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";

export default async function MfaPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/account/mfa");
  if (user.accountStatus !== "active") redirect("/unauthorized");

  return (
    <main style={{ padding: 24, maxWidth: 720 }}>
      <h1>Multi-Factor Authentication (TOTP)</h1>
      <p style={{ opacity: 0.75 }}>Use an authenticator app (Google Authenticator, Authy, etc.).</p>
      <MfaSetupPanel />
    </main>
  );
}

