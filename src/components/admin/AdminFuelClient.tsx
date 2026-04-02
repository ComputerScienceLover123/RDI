"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type TankRow = {
  id: string;
  storeId: string;
  storeName: string;
  tankNumber: number;
  grade: string;
  currentVolumeGallons: string;
  tankCapacityGallons: string;
  currentRetailPricePerGallon: string;
  fillPct: number;
};

function gaugeColor(pct: number): string {
  if (pct > 50) return "#16a34a";
  if (pct >= 25) return "#ca8a04";
  return "#dc2626";
}

function gradeLabel(g: string): string {
  return g.charAt(0).toUpperCase() + g.slice(1);
}

export default function AdminFuelClient() {
  const [tanks, setTanks] = useState<TankRow[]>([]);
  const [sort, setSort] = useState<"pct" | "store" | "tank">("pct");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const r = await fetch("/api/admin/fuel", { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      setErr(j?.error ?? "Failed to load");
      setLoading(false);
      return;
    }
    setTanks(j.tanks ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const storeSections = useMemo(() => {
    const byStore = new Map<string, TankRow[]>();
    for (const t of tanks) {
      if (!byStore.has(t.storeId)) byStore.set(t.storeId, []);
      byStore.get(t.storeId)!.push(t);
    }
    const sections = [...byStore.entries()].map(([storeId, rows]) => {
      const sortedRows =
        sort === "tank"
          ? [...rows].sort((a, b) => a.tankNumber - b.tankNumber)
          : [...rows].sort((a, b) => a.fillPct - b.fillPct || a.tankNumber - b.tankNumber);
      const minPct = Math.min(...sortedRows.map((r) => r.fillPct));
      const storeName = rows[0]?.storeName ?? storeId;
      return { storeId, storeName, rows: sortedRows, minPct };
    });
    if (sort === "pct") {
      sections.sort((a, b) => a.minPct - b.minPct || a.storeName.localeCompare(b.storeName));
    } else if (sort === "store") {
      sections.sort((a, b) => a.storeName.localeCompare(b.storeName));
    } else {
      sections.sort((a, b) => a.storeName.localeCompare(b.storeName));
    }
    return sections;
  }, [tanks, sort]);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/store" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Stores
        </Link>
      </div>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 8px" }}>Fuel overview (all stores)</h1>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Tank fill levels grouped by location. Default sort is lowest fill % first so urgent tanks appear at the top.
        </p>
      </header>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        <span style={{ fontSize: 14, alignSelf: "center" }}>Sort:</span>
        {(
          [
            ["pct", "Urgency (lowest % first)"],
            ["store", "Store name"],
            ["tank", "Tank number"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setSort(k)}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: sort === k ? "#e4e4e7" : "#fff",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? <p>Loading…</p> : null}
      {err ? <p style={{ color: "#b91c1c" }}>{err}</p> : null}

      {!loading && !err
        ? storeSections.map(({ storeId: sid, storeName: name, rows }) => (
              <section key={sid} style={{ marginBottom: 28 }}>
                <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>
                  <Link href={`/store/${encodeURIComponent(sid)}/fuel`} style={{ color: "#111", textDecoration: "none" }}>
                    {name}
                  </Link>
                  <span style={{ fontSize: 14, opacity: 0.6, marginLeft: 8 }}>({sid})</span>
                </h2>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                    gap: 16,
                  }}
                >
                  {rows.map((t) => {
                    const col = gaugeColor(t.fillPct);
                    return (
                      <div
                        key={t.id}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 10,
                          padding: 12,
                          background: "#fafafa",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <strong>
                            T{t.tankNumber} {gradeLabel(t.grade)}
                          </strong>
                          <span style={{ fontWeight: 700, color: col }}>{t.fillPct.toFixed(1)}%</span>
                        </div>
                        <div
                          style={{
                            marginTop: 8,
                            height: 16,
                            background: "#e5e7eb",
                            borderRadius: 6,
                            overflow: "hidden",
                          }}
                        >
                          <div style={{ width: `${Math.min(100, t.fillPct)}%`, height: "100%", background: col }} />
                        </div>
                        <p style={{ margin: "8px 0 0", fontSize: 13 }}>
                          {Number(t.currentVolumeGallons).toLocaleString(undefined, { maximumFractionDigits: 0 })} /{" "}
                          {Number(t.tankCapacityGallons).toLocaleString(undefined, { maximumFractionDigits: 0 })} gal
                        </p>
                        <p style={{ margin: "4px 0 0", fontSize: 13, opacity: 0.85 }}>
                          ${Number(t.currentRetailPricePerGallon).toFixed(3)}/gal
                        </p>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
        : null}
    </div>
  );
}
