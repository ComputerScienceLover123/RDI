"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PasswordChangeForm() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/auth/password-change", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Password change failed");
      router.push("/store");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span>New Password</span>
        <input
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </label>
      <button type="submit" disabled={busy}>
        {busy ? "Updating..." : "Update Password"}
      </button>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
    </form>
  );
}

