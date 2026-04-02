"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";

type Order = { id: string; status: string; totalCents?: number; createdAt?: string };

export default function OrdersSection({ storeId, role }: { storeId: string; role: "admin" | "manager" | "employee" }) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("Weekly restock");

  useEffect(() => {
    (async () => {
      setError(null);
      const resp = await fetch(`/api/orders/${encodeURIComponent(storeId)}`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) setError(data.error || "Failed to load orders");
      else setOrders(data.orders || []);
    })();
  }, [storeId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/orders/${encodeURIComponent(storeId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Create failed");
      const resp2 = await fetch(`/api/orders/${encodeURIComponent(storeId)}`);
      const data2 = await resp2.json().catch(() => ({}));
      setOrders(data2.orders || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setBusy(false);
    }
  }

  const canEdit = role === "admin" || role === "manager";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      <div>
        {orders ? (
          <ul>
            {orders.map((o) => (
              <li key={o.id}>
                <code>{o.id}</code> · {o.status}
              </li>
            ))}
          </ul>
        ) : (
          <p>Loading...</p>
        )}
      </div>

      <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
        <h3 style={{ marginTop: 0 }}>Ordering Actions</h3>
        {!canEdit ? <p>Read-only access.</p> : null}
        {canEdit ? (
          <form onSubmit={onCreate} style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Order Note</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} required />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? "Creating..." : "Create Order"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

