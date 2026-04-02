"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type Store = { id: string; name: string };
type UserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "manager" | "employee";
  assignedStoreId: string | null;
  storeName: string | null;
  accountStatus: "active" | "disabled";
  createdAt: string;
  lastLoginAt: string | null;
  mfaEnabled: boolean;
  forcePasswordChange: boolean;
};

export default function AdminUsersPanel() {
  const [stores, setStores] = useState<Store[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<UserRow["role"]>("employee");
  const [assignedStoreId, setAssignedStoreId] = useState<string>("");
  const [accountStatus, setAccountStatus] = useState<UserRow["accountStatus"]>("active");
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const resp = await fetch("/api/admin/users");
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Failed to load users");
      setStores(data.stores || []);
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const canCreate = useMemo(() => {
    if (busy) return false;
    if (!email || !password || !firstName || !lastName) return false;
    if ((role === "manager" || role === "employee") && !assignedStoreId) return false;
    return true;
  }, [busy, email, password, firstName, lastName, role, assignedStoreId]);

  async function createUser(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          role,
          assignedStoreId: role === "admin" ? null : assignedStoreId || null,
          accountStatus,
          forcePasswordChange,
          mfaEnabled,
          mfaSecret: null
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Create failed");
      await refresh();
      setEmail("");
      setPassword("");
      setFirstName("");
      setLastName("");
      setRole("employee");
      setAssignedStoreId("");
      setAccountStatus("active");
      setForcePasswordChange(false);
      setMfaEnabled(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  async function disableUser(userId: string, nextStatus: UserRow["accountStatus"]) {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountStatus: nextStatus }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Update failed");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      <div style={{ border: "1px solid #eee", padding: 16, borderRadius: 10 }}>
        <h2 style={{ marginTop: 0 }}>Create User</h2>
        <form onSubmit={createUser} style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>First Name</span>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Last Name</span>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </label>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Temporary Password</span>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} />
          </label>

          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value as UserRow["role"])} required>
                <option value="admin">admin</option>
                <option value="manager">manager</option>
                <option value="employee">employee</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Account Status</span>
              <select value={accountStatus} onChange={(e) => setAccountStatus(e.target.value as UserRow["accountStatus"])} required>
                <option value="active">active</option>
                <option value="disabled">disabled</option>
              </select>
            </label>
          </div>

          <label style={{ display: "grid", gap: 6, opacity: role === "admin" ? 0.5 : 1 }}>
            <span>Assigned Store</span>
            <select
              value={assignedStoreId}
              onChange={(e) => setAssignedStoreId(e.target.value)}
              disabled={role === "admin"}
              required={role !== "admin"}
            >
              <option value="">Select a store</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span>Require password change on first login</span>
            <input type="checkbox" checked={forcePasswordChange} onChange={(e) => setForcePasswordChange(e.target.checked)} />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span>Enable MFA (TOTP)</span>
            <input type="checkbox" checked={mfaEnabled} onChange={(e) => setMfaEnabled(e.target.checked)} />
            <span style={{ fontSize: 12, opacity: 0.75 }}>This prototype doesn’t expose a TOTP enrollment UI. Leave off for now.</span>
          </label>

          <button type="submit" disabled={!canCreate}>
            {busy ? "Creating..." : "Create Account"}
          </button>
        </form>
      </div>

      <div style={{ border: "1px solid #eee", padding: 16, borderRadius: 10 }}>
        <h2 style={{ marginTop: 0 }}>Existing Users</h2>
        {loading ? (
          <p>Loading...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>Email</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>Name</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>Role</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>Store</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>Status</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>MFA</th>
                  <th style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ padding: "10px 4px" }}>
                      <code>{u.email}</code>
                    </td>
                    <td style={{ padding: "10px 4px" }}>
                      {u.firstName} {u.lastName}
                    </td>
                    <td style={{ padding: "10px 4px" }}>
                      <code>{u.role}</code>
                    </td>
                    <td style={{ padding: "10px 4px" }}>
                      {u.storeName ? (
                        <>
                          {u.storeName} <code>({u.assignedStoreId})</code>
                        </>
                      ) : (
                        <span style={{ opacity: 0.7 }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 4px" }}>
                      <code>{u.accountStatus}</code>
                    </td>
                    <td style={{ padding: "10px 4px" }}>{u.mfaEnabled ? "enabled" : "off"}</td>
                    <td style={{ padding: "10px 4px" }}>
                      {u.role === "admin" ? (
                        <span style={{ opacity: 0.6 }}>n/a</span>
                      ) : u.accountStatus === "active" ? (
                        <button type="button" disabled={busy} onClick={() => disableUser(u.id, "disabled")}>
                          Disable
                        </button>
                      ) : (
                        <button type="button" disabled={busy} onClick={() => disableUser(u.id, "active")}>
                          Enable
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

