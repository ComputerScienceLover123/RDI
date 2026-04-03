"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type StoreRow = {
  storeId: string;
  storeName: string;
  packsSettledInRange: number;
  totalOverShort: string;
  staleActivePacks: number;
};

export default function AdminLotteryClient() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"name" | "overShort">("overShort");
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const sp = new URLSearchParams();
    sp.set("sort", sort);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    const r = await fetch(`/api/admin/lottery?${sp}`, { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      setErr(j?.error ?? "Failed to load");
      setLoading(false);
      return;
    }
    setStores(j.stores ?? []);
    setRange({ from: j.from, to: j.to });
    setLoading(false);
  }, [from, to, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/store" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Stores
        </Link>
      </div>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 8px" }}>Lottery (all stores)</h1>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Packs settled in range, total over/short, and stores with activated packs older than 14 days.
        </p>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" onClick={() => void load()} style={{ padding: "8px 14px" }}>
          Apply range
        </button>
        <span style={{ fontSize: 14, opacity: 0.75 }}>
          {range ? `Showing ${range.from} → ${range.to}` : null}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <span style={{ fontSize: 14 }}>Sort:</span>
        <button
          type="button"
          onClick={() => setSort("overShort")}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: sort === "overShort" ? "2px solid #2563eb" : "1px solid #ccc",
            background: sort === "overShort" ? "#eff6ff" : "#fff",
          }}
        >
          Over/short (high first)
        </button>
        <button
          type="button"
          onClick={() => setSort("name")}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: sort === "name" ? "2px solid #2563eb" : "1px solid #ccc",
            background: sort === "name" ? "#eff6ff" : "#fff",
          }}
        >
          Store name
        </button>
      </div>

      {err ? <p style={{ color: "#b91c1c" }}>{err}</p> : null}
      {loading ? <p>Loading…</p> : null}

      {!loading && !err ? (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: 8 }}>Store</th>
              <th style={{ padding: 8 }}>Packs settled</th>
              <th style={{ padding: 8 }}>Total over/short</th>
              <th style={{ padding: 8 }}>Stale packs (&gt;14d active)</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.storeId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: 8 }}>
                  <Link href={`/store/${encodeURIComponent(s.storeId)}/lottery`} style={{ color: "#2563eb", fontWeight: 600 }}>
                    {s.storeName}
                  </Link>
                </td>
                <td style={{ padding: 8 }}>{s.packsSettledInRange}</td>
                <td
                  style={{
                    padding: 8,
                    fontWeight: Math.abs(Number(s.totalOverShort)) > 0.01 ? 700 : 400,
                  }}
                >
                  ${s.totalOverShort}
                </td>
                <td style={{ padding: 8, background: s.staleActivePacks > 0 ? "#fffbeb" : undefined }}>
                  {s.staleActivePacks}
                  {s.staleActivePacks > 0 ? <span style={{ color: "#b45309", marginLeft: 8 }}>Needs attention</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
