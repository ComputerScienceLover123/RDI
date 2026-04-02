"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { UserRole } from "@prisma/client";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type StoreOption = { id: string; name: string };

type TankRow = {
  id: string;
  tankNumber: number;
  grade: string;
  currentVolumeGallons: string;
  tankCapacityGallons: string;
  currentRetailPricePerGallon: string;
  fillPct: number;
};

type DeliveryRow = {
  id: string;
  deliveryDate: string;
  volumeGallons: string;
  notes: string | null;
  tankNumber: number;
  grade: string;
  loggedByName: string;
  createdAt: string;
};

type TrendPoint = { date: string; gallons: number };

type PriceHistoryRow = {
  id: string;
  createdAt: string;
  oldPricePerGallon: string;
  newPricePerGallon: string;
  changedByName: string;
};

function gaugeColor(pct: number): string {
  if (pct > 50) return "#16a34a";
  if (pct >= 25) return "#ca8a04";
  return "#dc2626";
}

function gradeLabel(g: string): string {
  return g.charAt(0).toUpperCase() + g.slice(1);
}

export default function FuelManagementClient(props: {
  storeId: string;
  storeName: string;
  userRole: UserRole;
  adminStores: StoreOption[];
}) {
  const { storeId, storeName, userRole, adminStores } = props;
  const [tanks, setTanks] = useState<TankRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [priceHistoryByTank, setPriceHistoryByTank] = useState<Record<string, PriceHistoryRow[]>>({});
  const [canLogDelivery, setCanLogDelivery] = useState(false);
  const [canChangePrice, setCanChangePrice] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [fuelDataId, setFuelDataId] = useState("");
  const [delVol, setDelVol] = useState("");
  const [delNotes, setDelNotes] = useState("");
  const [delWarn, setDelWarn] = useState<string | null>(null);
  const [priceEditId, setPriceEditId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const r = await fetch(`/api/store/${encodeURIComponent(storeId)}/fuel`, { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      setErr(j?.error ?? "Failed to load fuel data");
      setLoading(false);
      return;
    }
    setTanks(j.tanks ?? []);
    setDeliveries(j.deliveries ?? []);
    setTrend(j.salesTrend14d ?? []);
    setPriceHistoryByTank((j.priceHistoryByTank as Record<string, PriceHistoryRow[]>) ?? {});
    setCanLogDelivery(!!j.canLogDelivery);
    setCanChangePrice(!!j.canChangePrice);
    setFuelDataId((prev) => prev || j.tanks?.[0]?.id || "");
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitDelivery() {
    setDelWarn(null);
    const v = Number(delVol);
    if (!fuelDataId || !Number.isFinite(v) || v <= 0) {
      showToast("Select a tank and enter a positive volume");
      return;
    }
    const r = await fetch(`/api/store/${encodeURIComponent(storeId)}/fuel/deliveries`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fuelDataId,
        volumeGallons: v,
        notes: delNotes.trim() || null,
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Could not log delivery");
      return;
    }
    if (j.warning) {
      setDelWarn(j.warning);
      showToast("Delivery saved — review capacity warning");
      await load();
      return;
    }
    showToast("Delivery logged");
    setDeliveryOpen(false);
    setDelVol("");
    setDelNotes("");
    await load();
  }

  async function savePrice(tankId: string) {
    const p = Number(priceInput);
    if (!Number.isFinite(p) || p <= 0) {
      showToast("Invalid price");
      return;
    }
    const r = await fetch(
      `/api/store/${encodeURIComponent(storeId)}/fuel/tanks/${encodeURIComponent(tankId)}/price`,
      {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pricePerGallon: p }),
      },
    );
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Could not update price");
      return;
    }
    showToast(j.unchanged ? "Price unchanged" : "Price updated");
    setPriceEditId(null);
    await load();
  }

  const chartData = trend.map((row) => ({
    ...row,
    label: row.date.slice(5),
  }));

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <Link href={`/store/${encodeURIComponent(storeId)}`} style={{ textDecoration: "none", color: "#2563eb" }}>
          ← Store dashboard
        </Link>
        {userRole === "admin" && adminStores.length > 1 ? (
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <span style={{ fontSize: 14, opacity: 0.85 }}>Store</span>
            <select
              value={storeId}
              onChange={(e) => {
                const id = e.target.value;
                if (id !== storeId) window.location.href = `/store/${encodeURIComponent(id)}/fuel`;
              }}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc", minWidth: 200 }}
            >
              {adminStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 4px" }}>Fuel · {storeName}</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>
          Tank gauges, deliveries, retail price, and estimated daily gallons sold (from volume snapshots + deliveries).
        </p>
      </header>

      {toast ? (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#111827",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 8,
            zIndex: 50,
            boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
          }}
        >
          {toast}
        </div>
      ) : null}

      {loading ? <p>Loading…</p> : null}
      {err ? <p style={{ color: "#b91c1c" }}>{err}</p> : null}

      {!loading && !err ? (
        <>
          <section style={{ marginBottom: 32 }}>
            <h2 style={{ marginTop: 0 }}>Tanks</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 20,
              }}
            >
              {tanks.map((t) => {
                const pct = t.fillPct;
                const col = gaugeColor(pct);
                return (
                  <div
                    key={t.id}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 12,
                      padding: 16,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <strong>
                        Tank {t.tankNumber} · {gradeLabel(t.grade)}
                      </strong>
                      <span style={{ fontSize: 13, fontWeight: 600, color: col }}>{pct.toFixed(1)}%</span>
                    </div>
                    <div
                      style={{
                        marginTop: 12,
                        height: 22,
                        background: "#e5e7eb",
                        borderRadius: 8,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, pct)}%`,
                          height: "100%",
                          background: col,
                          transition: "width 0.25s ease",
                        }}
                      />
                    </div>
                    <p style={{ margin: "12px 0 4px", fontSize: 14 }}>
                      <strong>{Number(t.currentVolumeGallons).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong> gal /{" "}
                      {Number(t.tankCapacityGallons).toLocaleString(undefined, { maximumFractionDigits: 0 })} gal
                    </p>
                    <p style={{ margin: "0 0 8px", fontSize: 14, opacity: 0.85 }}>
                      Retail:{" "}
                      <strong>${Number(t.currentRetailPricePerGallon).toFixed(3)}</strong>/gal
                    </p>
                    {canChangePrice ? (
                      priceEditId === t.id ? (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <input
                            type="number"
                            step="0.001"
                            min="0.001"
                            value={priceInput}
                            onChange={(e) => setPriceInput(e.target.value)}
                            style={{ width: 100, padding: 6, borderRadius: 6, border: "1px solid #ccc" }}
                          />
                          <button
                            type="button"
                            onClick={() => void savePrice(t.id)}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 6,
                              border: "none",
                              background: "#2563eb",
                              color: "#fff",
                              cursor: "pointer",
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setPriceEditId(null)}
                            style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid #ccc", background: "#fff" }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setPriceEditId(t.id);
                            setPriceInput(t.currentRetailPricePerGallon);
                          }}
                          style={{
                            fontSize: 13,
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: "1px solid #ccc",
                            background: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          Update price
                        </button>
                      )
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p style={{ fontSize: 12, opacity: 0.75, marginTop: 12 }}>
              Gauge color: green over 50% full, yellow 25–50%, red under 25%. Automated alerts use the same thresholds
              (warning / critical).
            </p>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 style={{ marginTop: 0 }}>Recent retail price changes</h2>
            <p style={{ fontSize: 14, opacity: 0.8, marginBottom: 16 }}>
              Last 10 price updates per tank (newest first).
            </p>
            {tanks.map((t) => {
              const rows = priceHistoryByTank[t.id] ?? [];
              return (
                <div key={`ph-${t.id}`} style={{ marginBottom: 24 }}>
                  <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>
                    Tank {t.tankNumber} · {gradeLabel(t.grade)}
                  </h3>
                  {rows.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 14, opacity: 0.7 }}>No price changes recorded yet.</p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", maxWidth: 720, borderCollapse: "collapse", fontSize: 14 }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                            <th style={{ padding: "8px 10px 8px 0" }}>Date</th>
                            <th style={{ padding: "8px 10px" }}>Old price</th>
                            <th style={{ padding: "8px 10px" }}>New price</th>
                            <th style={{ padding: "8px 10px" }}>Changed by</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
                              <td style={{ padding: "8px 10px 8px 0", whiteSpace: "nowrap" }}>
                                {new Date(row.createdAt).toLocaleString()}
                              </td>
                              <td style={{ padding: "8px 10px" }}>${Number(row.oldPricePerGallon).toFixed(3)}</td>
                              <td style={{ padding: "8px 10px" }}>${Number(row.newPricePerGallon).toFixed(3)}</td>
                              <td style={{ padding: "8px 10px" }}>{row.changedByName}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 style={{ marginTop: 0 }}>Estimated daily gallons sold (14 days)</h2>
            <p style={{ fontSize: 14, opacity: 0.8, maxWidth: 640 }}>
              Each point uses prior-day volume plus same-day deliveries minus that day&apos;s ending volume (from daily
              snapshots recorded when this page loads).
            </p>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={44} />
                  <Tooltip
                    formatter={(v) => [`${Number(v)} gal`, "Est. sold"]}
                    labelFormatter={(_, items) => String((items?.[0]?.payload as TrendPoint | undefined)?.date ?? "")}
                  />
                  <Line type="monotone" dataKey="gallons" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name="Gallons" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>Delivery log</h2>
              {canLogDelivery ? (
                <button
                  type="button"
                  onClick={() => setDeliveryOpen(true)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "none",
                    background: "#2563eb",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Log delivery
                </button>
              ) : null}
            </div>
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
                    <th style={{ padding: "8px 6px" }}>Date</th>
                    <th style={{ padding: "8px 6px" }}>Tank</th>
                    <th style={{ padding: "8px 6px" }}>Grade</th>
                    <th style={{ padding: "8px 6px" }}>Volume (gal)</th>
                    <th style={{ padding: "8px 6px" }}>Notes</th>
                    <th style={{ padding: "8px 6px" }}>Logged by</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
                      <td style={{ padding: "8px 6px" }}>{row.deliveryDate}</td>
                      <td style={{ padding: "8px 6px" }}>{row.tankNumber}</td>
                      <td style={{ padding: "8px 6px" }}>{gradeLabel(row.grade)}</td>
                      <td style={{ padding: "8px 6px" }}>{Number(row.volumeGallons).toLocaleString()}</td>
                      <td style={{ padding: "8px 6px", maxWidth: 220 }}>{row.notes ?? "—"}</td>
                      <td style={{ padding: "8px 6px" }}>{row.loggedByName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {deliveries.length === 0 ? <p style={{ opacity: 0.7 }}>No deliveries recorded yet.</p> : null}
            </div>
          </section>
        </>
      ) : null}

      {deliveryOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 40,
            padding: 16,
          }}
          onClick={() => setDeliveryOpen(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              maxWidth: 400,
              width: "100%",
              padding: 20,
              boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Log fuel delivery</h3>
            <label style={{ display: "block", marginBottom: 12, fontSize: 14 }}>
              Tank
              <select
                value={fuelDataId}
                onChange={(e) => setFuelDataId(e.target.value)}
                style={{ display: "block", width: "100%", marginTop: 4, padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              >
                {tanks.map((t) => (
                  <option key={t.id} value={t.id}>
                    Tank {t.tankNumber} — {gradeLabel(t.grade)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "block", marginBottom: 12, fontSize: 14 }}>
              Volume delivered (gallons)
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={delVol}
                onChange={(e) => setDelVol(e.target.value)}
                style={{ display: "block", width: "100%", marginTop: 4, padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 12, fontSize: 14 }}>
              Notes (supplier / driver)
              <textarea
                value={delNotes}
                onChange={(e) => setDelNotes(e.target.value)}
                rows={3}
                style={{ display: "block", width: "100%", marginTop: 4, padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </label>
            {delWarn ? <p style={{ color: "#b45309", fontSize: 14 }}>{delWarn}</p> : null}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => void submitDelivery()}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Submit
              </button>
              <button
                type="button"
                onClick={() => setDeliveryOpen(false)}
                style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #ccc", background: "#fff" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
