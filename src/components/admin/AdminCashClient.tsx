"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type StoreRow = {
  storeId: string;
  storeName: string;
  totalAbsOverShort: string;
  warnCount: number;
  criticalCount: number;
  flagged: boolean;
};

type OverviewResponse = {
  dateRange: { from: string; to: string };
  stores: StoreRow[];
  chartStores: Array<{ storeId: string; storeName: string }>;
  chartData: Array<Record<string, string | number>>;
};

type RegisterDetail = {
  id: string;
  registerName: string;
  openedAt: string;
  openedByEmployeeName: string;
  closedAt: string | null;
  closedByEmployeeName: string;
  closingCashAmount: string | null;
  expectedClosingAmount: string | null;
  overShortAmount: string | null;
  verified: boolean;
};

type DetailResponse = {
  dateRange: { from: string; to: string };
  registers: RegisterDetail[];
  safe: null | {
    lastSafeCountId: string;
    timestamp: string;
    countedSafeBalance: string;
    expectedSafeBalanceBefore: string;
    mismatchAmount: string;
  };
};

export default function AdminCashClient() {
  const [from, setFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [to, setTo] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [history, setHistory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [historyRegisterId, setHistoryRegisterId] = useState<string>("");
  const [historyEmployeeId, setHistoryEmployeeId] = useState<string>("");
  const [historyDropType, setHistoryDropType] = useState<string>("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const p = new URLSearchParams();
    p.set("dateFrom", from);
    p.set("dateTo", to);
    const res = await fetch(`/api/admin/cash/overview?${p.toString()}`, { credentials: "include" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(j.error ?? "Failed to load overview");
      setLoading(false);
      return;
    }
    setOverview(j as OverviewResponse);
    if (!selectedStoreId && (j.stores ?? []).length > 0) setSelectedStoreId(j.stores[0]!.storeId);
    setLoading(false);
  }, [from, selectedStoreId, to]);

  const loadDetail = useCallback(async () => {
    if (!selectedStoreId) return;
    const p = new URLSearchParams();
    p.set("dateFrom", from);
    p.set("dateTo", to);
    const res = await fetch(`/api/admin/cash/store/${encodeURIComponent(selectedStoreId)}/detail?${p.toString()}`, {
      credentials: "include",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setDetail(j as DetailResponse);
  }, [from, selectedStoreId, to]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (!selectedStoreId) return;
    void loadDetail();
  }, [selectedStoreId, loadDetail]);

  async function loadHistory() {
    const p = new URLSearchParams();
    p.set("dateFrom", from);
    p.set("dateTo", to);
    if (selectedStoreId) p.set("storeId", selectedStoreId);
    if (historyRegisterId.trim()) p.set("registerId", historyRegisterId.trim());
    if (historyEmployeeId.trim()) p.set("employeeId", historyEmployeeId.trim());
    if (historyDropType.trim()) p.set("dropType", historyDropType.trim());

    const res = await fetch(`/api/admin/cash/history?${p.toString()}`, { credentials: "include" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return;
    setHistory(j);
  }

  if (loading && !overview) return <main style={{ padding: 24 }}>Loading cash compliance…</main>;
  if (err) return <main style={{ padding: 24 }}>{err}</main>;

  const stores = overview?.stores ?? [];
  const chartStores = overview?.chartStores ?? [];
  const chartData = overview?.chartData ?? [];

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <p>
        <Link href="/store" style={{ color: "#2563eb" }}>
          ← Stores
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Cash management overview</h1>
      <p style={{ opacity: 0.85, maxWidth: 720 }}>
        Uses verified register closes. Over/short alerts are generated from the manager-approved closes and safe count mismatches.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 18 }}>
        <label style={{ display: "grid", gap: 6 }}>
          Date From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          Date To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" onClick={() => void loadOverview()} style={{ padding: "10px 16px" }}>
          Apply
        </button>
        <label style={{ display: "grid", gap: 6, marginLeft: "auto", minWidth: 260 }}>
          Drill down store
          <select value={selectedStoreId} onChange={(e) => setSelectedStoreId(e.target.value)} style={{ padding: 8 }}>
            {stores.map((s) => (
              <option key={s.storeId} value={s.storeId}>
                {s.storeName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Over/short trend (last 30 days)</h2>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={chartData as any} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} />
              <YAxis domain={[0, "auto"]} tick={{ fontSize: 11 }} allowDecimals />
              <Tooltip />
              <Legend />
              {chartStores.map((s) => (
                <Line key={s.storeId} type="monotone" dataKey={s.storeName} name={s.storeName} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>By store ({overview?.dateRange.from} → {overview?.dateRange.to})</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th style={{ padding: 8 }}>Store</th>
                <th style={{ padding: 8 }}>Total abs over/short</th>
                <th style={{ padding: 8 }}>Warnings (&gt; $5)</th>
                <th style={{ padding: 8 }}>Criticals (&gt; $20)</th>
                <th style={{ padding: 8 }}>Flag</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.storeId} style={{ borderBottom: "1px solid #eee", background: s.flagged ? "#fff7ed" : undefined }}>
                  <td style={{ padding: 8 }}>
                    <button
                      type="button"
                      onClick={() => setSelectedStoreId(s.storeId)}
                      style={{ padding: "0", border: 0, background: "transparent", color: "#2563eb", cursor: "pointer", fontWeight: 700 }}
                    >
                      {s.storeName}
                    </button>
                  </td>
                  <td style={{ padding: 8 }}>${s.totalAbsOverShort}</td>
                  <td style={{ padding: 8 }}>{s.warnCount}</td>
                  <td style={{ padding: 8 }}>{s.criticalCount}</td>
                  <td style={{ padding: 8 }}>{s.flagged ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Register-level detail</h2>
        {detail ? (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
              {detail.safe ? (
                <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10 }}>
                  <div style={{ fontSize: 13, opacity: 0.85 }}>Latest safe count</div>
                  <div style={{ fontSize: 14, marginTop: 6 }}>
                    Expected before: <strong>${detail.safe.expectedSafeBalanceBefore}</strong>
                    <br />
                    Counted: <strong>${detail.safe.countedSafeBalance}</strong>
                    <br />
                    Mismatch: <strong>${detail.safe.mismatchAmount}</strong>
                  </div>
                </div>
              ) : null}
              {!detail.safe ? <div style={{ opacity: 0.8 }}>No safe counts found for this range.</div> : null}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                    <th style={{ padding: 8 }}>Register</th>
                    <th style={{ padding: 8 }}>Opened</th>
                    <th style={{ padding: 8 }}>Opened by</th>
                    <th style={{ padding: 8 }}>Closed</th>
                    <th style={{ padding: 8 }}>Closed by</th>
                    <th style={{ padding: 8 }}>Expected</th>
                    <th style={{ padding: 8 }}>Actual</th>
                    <th style={{ padding: 8 }}>Over/Short</th>
                    <th style={{ padding: 8 }}>Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.registers.map((r) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: 8 }}>{r.registerName}</td>
                      <td style={{ padding: 8 }}>{new Date(r.openedAt).toLocaleString()}</td>
                      <td style={{ padding: 8 }}>{r.openedByEmployeeName}</td>
                      <td style={{ padding: 8 }}>{r.closedAt ? new Date(r.closedAt).toLocaleString() : "—"}</td>
                      <td style={{ padding: 8 }}>{r.closedByEmployeeName}</td>
                      <td style={{ padding: 8 }}>${r.expectedClosingAmount ?? "—"}</td>
                      <td style={{ padding: 8 }}>${r.closingCashAmount ?? "—"}</td>
                      <td
                        style={{
                          padding: 8,
                          color:
                            r.overShortAmount && Math.abs(Number(r.overShortAmount)) > 20
                              ? "#b91c1c"
                              : r.overShortAmount && Math.abs(Number(r.overShortAmount)) > 5
                                ? "#b45309"
                                : undefined,
                        }}
                      >
                        ${r.overShortAmount ?? "—"}
                      </td>
                      <td style={{ padding: 8 }}>{r.verified ? "Yes" : "No"}</td>
                    </tr>
                  ))}
                  {detail.registers.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ padding: 8, opacity: 0.7 }}>
                        No register closes in this range.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p style={{ opacity: 0.8 }}>Loading store detail…</p>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginTop: 0 }}>Cash history (search)</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <label style={{ display: "grid", gap: 6 }}>
            Register ID (optional)
            <input value={historyRegisterId} onChange={(e) => setHistoryRegisterId(e.target.value)} style={{ padding: 8, width: 220 }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            Employee ID (optional)
            <input value={historyEmployeeId} onChange={(e) => setHistoryEmployeeId(e.target.value)} style={{ padding: 8, width: 220 }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            Drop type (optional)
            <select value={historyDropType} onChange={(e) => setHistoryDropType(e.target.value)} style={{ padding: 8, width: 260 }}>
              <option value="">Any</option>
              <option value="safe_drop">safe_drop</option>
              <option value="bank_deposit">bank_deposit</option>
              <option value="change_order_received">change_order_received</option>
            </select>
          </label>
          <button type="button" onClick={() => void loadHistory()} style={{ padding: "10px 16px" }}>
            Search
          </button>
        </div>
        {history ? (
          <div style={{ marginTop: 18, overflowX: "auto" }}>
            <h3 style={{ fontSize: 16, marginTop: 0 }}>Cash drops / deposits</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 18 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                  <th style={{ padding: 8 }}>Type</th>
                  <th style={{ padding: 8 }}>Store</th>
                  <th style={{ padding: 8 }}>Register</th>
                  <th style={{ padding: 8 }}>Employee</th>
                  <th style={{ padding: 8 }}>Amount</th>
                  <th style={{ padding: 8 }}>When</th>
                  <th style={{ padding: 8 }}>Verified</th>
                </tr>
              </thead>
              <tbody>
                {(history.cashDrops ?? []).map((d: any) => (
                  <tr key={d.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}>
                      <code>{d.dropType}</code>
                    </td>
                    <td style={{ padding: 8 }}>{d.storeId}</td>
                    <td style={{ padding: 8 }}>{d.register?.registerName ?? d.registerId}</td>
                    <td style={{ padding: 8 }}>{d.employeeId}</td>
                    <td style={{ padding: 8 }}>${d.amountDropped}</td>
                    <td style={{ padding: 8 }}>{new Date(d.droppedAt).toLocaleString()}</td>
                    <td style={{ padding: 8 }}>{d.verified ? "Yes" : "No"}</td>
                  </tr>
                ))}
                {(history.cashDrops ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 8, opacity: 0.7 }}>
                      No cash drops found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>

            <h3 style={{ fontSize: 16, marginTop: 0 }}>Register closes</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                  <th style={{ padding: 8 }}>Store</th>
                  <th style={{ padding: 8 }}>Register</th>
                  <th style={{ padding: 8 }}>Closed by</th>
                  <th style={{ padding: 8 }}>When</th>
                  <th style={{ padding: 8 }}>Over/Short</th>
                  <th style={{ padding: 8 }}>Verified</th>
                </tr>
              </thead>
              <tbody>
                {(history.registerClosures ?? []).map((r: any) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}>{r.storeId}</td>
                    <td style={{ padding: 8 }}>{r.registerName}</td>
                    <td style={{ padding: 8 }}>{r.closedByEmployeeId}</td>
                    <td style={{ padding: 8 }}>{new Date(r.closedAt).toLocaleString()}</td>
                    <td style={{ padding: 8 }}>${r.overShortAmount ?? "—"}</td>
                    <td style={{ padding: 8 }}>{r.verified ? "Yes" : "No"}</td>
                  </tr>
                ))}
                {(history.registerClosures ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 8, opacity: 0.7 }}>
                      No register closes found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}

