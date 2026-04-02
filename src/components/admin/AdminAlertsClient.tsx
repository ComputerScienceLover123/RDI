"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  id: string;
  storeId: string | null;
  storeName: string | null;
  recipientEmail: string;
  recipientName: string;
  recipientRole: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  linkUrl: string;
  read: boolean;
  createdAt: string;
};

type StoreOpt = { id: string; name: string };

export default function AdminAlertsClient() {
  const [storeId, setStoreId] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [category, setCategory] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    notifications: Row[];
    total: number;
    totalPages: number;
    stores: StoreOpt[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const q = new URLSearchParams({ page: String(page) });
    if (storeId !== "all") q.set("storeId", storeId);
    if (severity !== "all") q.set("severity", severity);
    if (category !== "all") q.set("category", category);
    if (from.trim()) q.set("from", from.trim());
    if (to.trim()) q.set("to", to.trim());
    const res = await fetch(`/api/admin/notifications?${q}`, { credentials: "include" });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [page, storeId, severity, category, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [storeId, severity, category, from, to]);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20, alignItems: "flex-end" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13 }}>Store</span>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            style={{ padding: "8px 10px", minWidth: 180 }}
          >
            <option value="all">All stores</option>
            {data?.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13 }}>Severity</span>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            style={{ padding: "8px 10px" }}
          >
            <option value="all">All</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13 }}>Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ padding: "8px 10px" }}
          >
            <option value="all">All</option>
            <option value="low_stock">Low stock</option>
            <option value="void_alert">Void alert</option>
            <option value="delivery">Delivery</option>
            <option value="audit">Audit</option>
            <option value="shrinkage">Shrinkage</option>
            <option value="system">System</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13 }}>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: 8 }} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 13 }}>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: 8 }} />
        </label>
        <button type="button" onClick={() => void load()} style={{ padding: "8px 14px" }}>
          Apply
        </button>
      </div>

      {loading ? <p>Loading…</p> : null}
      {data && !loading ? (
        <>
          <p style={{ opacity: 0.8 }}>
            {data.total} notification(s) · page {page} of {data.totalPages || 1}
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                  <th style={{ padding: 8 }}>Time</th>
                  <th style={{ padding: 8 }}>Store</th>
                  <th style={{ padding: 8 }}>Recipient</th>
                  <th style={{ padding: 8 }}>Severity</th>
                  <th style={{ padding: 8 }}>Category</th>
                  <th style={{ padding: 8 }}>Title</th>
                  <th style={{ padding: 8 }}>Read</th>
                  <th style={{ padding: 8 }}>Link</th>
                </tr>
              </thead>
              <tbody>
                {data.notifications.map((n) => (
                  <tr key={n.id} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                    <td style={{ padding: 8, whiteSpace: "nowrap" }}>{new Date(n.createdAt).toLocaleString()}</td>
                    <td style={{ padding: 8 }}>{n.storeName ?? "—"}</td>
                    <td style={{ padding: 8 }}>
                      {n.recipientName}
                      <br />
                      <span style={{ opacity: 0.7, fontSize: 11 }}>{n.recipientEmail}</span>
                    </td>
                    <td style={{ padding: 8 }}>{n.severity}</td>
                    <td style={{ padding: 8 }}>{n.category}</td>
                    <td style={{ padding: 8 }}>
                      <strong>{n.title}</strong>
                      <div style={{ opacity: 0.85, marginTop: 4 }}>{n.description}</div>
                    </td>
                    <td style={{ padding: 8 }}>{n.read ? "Yes" : "No"}</td>
                    <td style={{ padding: 8 }}>
                      <a href={n.linkUrl} style={{ color: "#2563eb" }}>
                        Open
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 ? (
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </button>
              <button type="button" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
