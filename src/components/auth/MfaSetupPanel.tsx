"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";

type SetupResp = { ok?: boolean; alreadyEnabled?: boolean; issuer?: string; secret?: string; otpauthUrl?: string; error?: string };

export default function MfaSetupPanel() {
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpAuthUrl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setError(null);
      try {
        const resp = await fetch("/api/auth/mfa/setup", { method: "POST" });
        const data = (await resp.json().catch(() => ({}))) as SetupResp;
        if (!resp.ok) throw new Error(data.error || "MFA setup failed");
        if (data.alreadyEnabled) {
          setSecret(null);
          setOtpAuthUrl(null);
          setStatus("MFA is already enabled.");
          return;
        }
        setSecret(data.secret ?? null);
        setOtpAuthUrl(data.otpauthUrl ?? null);
        setStatus("Secret generated. Enter the 6-digit code from your authenticator app.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unexpected error");
      }
    })();
  }, []);

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/auth/mfa/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Invalid code");
      setStatus("MFA enabled. Next login will require a code.");
      setCode("");
      // Re-run setup to show already-enabled state.
      const resp2 = await fetch("/api/auth/mfa/setup", { method: "POST" });
      const data2 = (await resp2.json().catch(() => ({}))) as SetupResp;
      if (data2.alreadyEnabled) {
        setSecret(null);
        setOtpAuthUrl(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {status ? <p style={{ opacity: 0.85 }}>{status}</p> : null}
      {secret && otpauthUrl ? (
        <div style={{ border: "1px solid #eee", padding: 12, borderRadius: 10 }}>
          <p style={{ marginTop: 0 }}>
            Issuer/Account secret (manual entry):
          </p>
          <p>
            <code>{secret}</code>
          </p>
          <p style={{ opacity: 0.75, fontSize: 12 }}>
            otpauth URI (you can use this with QR generators):
          </p>
          <p style={{ wordBreak: "break-all", fontSize: 12 }}>
            <code>{otpauthUrl}</code>
          </p>
        </div>
      ) : null}

      <form onSubmit={confirm} style={{ display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>6-digit TOTP code</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            required
            placeholder="123 456"
          />
        </label>
        <button type="submit" disabled={busy || code.trim().length === 0}>
          {busy ? "Confirming..." : "Enable MFA"}
        </button>
      </form>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
    </div>
  );
}

