"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LoginResp = { ok?: boolean; mfaRequired?: boolean; forcePasswordChange?: boolean; error?: string };

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/store";

  const [mode, setMode] = useState<"password" | "mfa">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitDisabled = useMemo(() => {
    if (busy) return true;
    if (mode === "password") return !email || !password;
    return !mfaCode;
  }, [busy, email, password, mfaCode, mode]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "password") {
        const resp = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = (await resp.json()) as LoginResp;
        if (!resp.ok) throw new Error(data.error || "Login failed");
        if (data.mfaRequired) {
          setMode("mfa");
          return;
        }
        if (data.forcePasswordChange) router.push("/password-change");
        else router.push(nextPath);
        return;
      }

      // mode === "mfa"
      const resp = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: mfaCode }),
      });
      const data = (await resp.json()) as LoginResp;
      if (!resp.ok) throw new Error(data.error || "MFA verification failed");
      if (data.forcePasswordChange) router.push("/password-change");
      else router.push(nextPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 520 }}>
      <h1>Login</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        {mode === "password" ? (
          <>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Email</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Password</span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                required
              />
            </label>
          </>
        ) : (
          <>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Authenticator code (TOTP)</span>
              <input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} inputMode="numeric" required />
            </label>
            <button type="button" onClick={() => setMode("password")} disabled={busy}>
              Back
            </button>
          </>
        )}
        <button type="submit" disabled={submitDisabled}>
          {busy ? "Please wait..." : mode === "password" ? "Sign in" : "Verify MFA"}
        </button>
        {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      </form>
      <p style={{ marginTop: 16, opacity: 0.75 }}>
        Demo admin: <code>admin@company.com</code> with temporary password from your <code>.env</code>.
      </p>
    </main>
  );
}

