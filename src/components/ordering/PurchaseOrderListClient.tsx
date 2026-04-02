"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PurchaseOrderStatus } from "@prisma/client";

type PoRow = {
  id: string;
  status: PurchaseOrderStatus;
  dateOrdered: string;
  dateReceived: string | null;
  totalCost: string;
  notes: string | null;
  vendor: { id: string; companyName: string };
  lineCount: number;
  orderedBy: string;
};

function statusPill(status: PurchaseOrderStatus) {
  const map: Record<PurchaseOrderStatus, { bg: string; color: string }> = {
    draft: { bg: "#f4f4f5", color: "#52525b" },
    submitted: { bg: "#dbeafe", color: "#1d4ed8" },
    received: { bg: "#dcfce7", color: "#15803d" },
    cancelled: { bg: "#fee2e2", color: "#b91c1c" },
  };
  const s = map[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

export default function PurchaseOrderListClient(props: { storeId: string; canManage: boolean }) {
  const { storeId, canManage } = props;
  const [rows, setRows] = useState<PoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vendorSearch, setVendorSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sortBy, setSortBy] = useState<"dateOrdered" | "vendor" | "status">("dateOrdered");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [quickBusy, setQuickBusy] = useState(false);

  const qs = useCallback(() => {
    const p = new URLSearchParams();
    p.set("sortBy", sortBy);
    p.set("sortOrder", sortOrder);
    if (vendorSearch.trim()) p.set("vendor", vendorSearch.trim());
    if (status) p.set("status", status);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [sortBy, sortOrder, vendorSearch, status, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/purchase-orders?${qs()}`, {
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setRows(data.purchaseOrders ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [storeId, qs]);

  useEffect(() => {
    load();
  }, [load]);

  async function quickReorder() {
    if (!canManage) return;
    setQuickBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/purchase-orders/quick-reorder`, {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Quick reorder failed");
      if (data.createdIds?.length) {
        await load();
        alert(`Created ${data.createdIds.length} draft purchase order(s). Review and submit each from the list.`);
      } else {
        alert(data.message || "No low-stock products.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Quick reorder failed");
    } finally {
      setQuickBusy(false);
    }
  }

  function toggleSort(col: "dateOrdered" | "vendor" | "status") {
    if (sortBy === col) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortOrder(col === "dateOrdered" ? "desc" : "asc");
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <Link href={`/store/${encodeURIComponent(storeId)}`} style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Store dashboard
        </Link>
      </div>
      <h1 style={{ marginTop: 0 }}>Purchase orders</h1>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        {canManage ? "Create, submit, and receive orders for this store." : "View-only access."}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
        {canManage ? (
          <>
            <Link
              href={`/store/${encodeURIComponent(storeId)}/ordering/new`}
              style={{
                display: "inline-block",
                padding: "10px 16px",
                background: "#2563eb",
                color: "#fff",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              New purchase order
            </Link>
            <button
              type="button"
              onClick={quickReorder}
              disabled={quickBusy}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: quickBusy ? "wait" : "pointer",
                fontWeight: 600,
              }}
            >
              {quickBusy ? "Working…" : "Quick reorder (low stock)"}
            </button>
          </>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
          gap: 10,
          marginBottom: 16,
          padding: 12,
          background: "#fafafa",
          borderRadius: 8,
          border: "1px solid #eee",
        }}
      >
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Vendor search</span>
          <input
            value={vendorSearch}
            onChange={(e) => setVendorSearch(e.target.value)}
            placeholder="Vendor name"
            style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          >
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="received">Received</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12, opacity: 0.75 }}>To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>
      </div>

      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ overflowX: "auto", border: "1px solid #e5e5e5", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f4f4f5", textAlign: "left" }}>
                <th style={{ padding: 10 }}>
                  <button
                    type="button"
                    onClick={() => toggleSort("dateOrdered")}
                    style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 600 }}
                  >
                    Date {sortBy === "dateOrdered" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ padding: 10 }}>
                  <button
                    type="button"
                    onClick={() => toggleSort("vendor")}
                    style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 600 }}
                  >
                    Vendor {sortBy === "vendor" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ padding: 10 }}>
                  <button
                    type="button"
                    onClick={() => toggleSort("status")}
                    style={{ border: "none", background: "transparent", cursor: "pointer", fontWeight: 600 }}
                  >
                    Status {sortBy === "status" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
                  </button>
                </th>
                <th style={{ padding: 10 }}>Lines</th>
                <th style={{ padding: 10 }}>Total</th>
                <th style={{ padding: 10 }}>By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 10 }}>
                    <Link
                      href={`/store/${encodeURIComponent(storeId)}/ordering/${encodeURIComponent(r.id)}`}
                      style={{ color: "#2563eb", fontWeight: 600 }}
                    >
                      {new Date(r.dateOrdered).toLocaleString()}
                    </Link>
                  </td>
                  <td style={{ padding: 10 }}>{r.vendor.companyName}</td>
                  <td style={{ padding: 10 }}>{statusPill(r.status)}</td>
                  <td style={{ padding: 10 }}>{r.lineCount}</td>
                  <td style={{ padding: 10 }}>${r.totalCost}</td>
                  <td style={{ padding: 10 }}>{r.orderedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p style={{ padding: 16, opacity: 0.75 }}>No purchase orders match.</p> : null}
        </div>
      )}
    </div>
  );
}
