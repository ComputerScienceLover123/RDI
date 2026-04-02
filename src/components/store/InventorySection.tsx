"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";

type Item = { sku: string; name: string; quantity: number };

export default function InventorySection({ storeId, role }: { storeId: string; role: "admin" | "manager" | "employee" }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("New Item");
  const [quantity, setQuantity] = useState(10);

  useEffect(() => {
    (async () => {
      setError(null);
      const resp = await fetch(`/api/inventory/${encodeURIComponent(storeId)}`);
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) setError(data.error || "Failed to load inventory");
      else setItems(data.items || []);
    })();
  }, [storeId]);

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/inventory/${encodeURIComponent(storeId)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, quantity }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || "Add failed");
      // This is a prototype: we just refetch the list.
      const resp2 = await fetch(`/api/inventory/${encodeURIComponent(storeId)}`);
      const data2 = await resp2.json().catch(() => ({}));
      setItems(data2.items || []);
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
        {items ? (
          <ul>
            {items.map((it) => (
              <li key={it.sku}>
                <code>{it.sku}</code> · {it.name} · qty {it.quantity}
              </li>
            ))}
          </ul>
        ) : (
          <p>Loading...</p>
        )}
      </div>

      <div style={{ padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
        <h3 style={{ marginTop: 0 }}>Inventory Actions</h3>
        {!canEdit ? <p>Read-only access.</p> : null}
        {canEdit ? (
          <form onSubmit={onAdd} style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Item Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Quantity</span>
              <input
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                type="number"
                min={1}
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? "Adding..." : "Add / Restock"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

