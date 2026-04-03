"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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

type TrendPoint = {
  date: string;
  complianceRate: number | null;
  verificationCount: number;
  gapCount: number;
  hasComplianceGap: boolean;
};

type ScoreRow = {
  employeeId: string;
  name: string;
  role: string;
  ageRestrictedLineCount: number;
  approvedVerifications: number;
  declinedVerifications: number;
  gapCount: number;
  verificationRate: number | null;
};

export default function StoreComplianceClient(props: { storeId: string; mode: "employee" | "store" }) {
  const { storeId, mode } = props;
  const base = `/store/${encodeURIComponent(storeId)}/compliance`;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [meLogs, setMeLogs] = useState<
    Array<{
      id: string;
      verifiedAt: string;
      productName: string;
      result: string;
      declinedReason: string | null;
    }>
  >([]);
  const [meSummary, setMeSummary] = useState<{
    last30Days: ScoreRow | null;
    today: { approved: number; declined: number; total: number };
  } | null>(null);

  const [today, setToday] = useState<{
    approvedVerifications: number;
    declinedVerifications: number;
    totalVerifications: number;
    complianceRatePercent: number | null;
  } | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [scorecards, setScorecards] = useState<ScoreRow[]>([]);

  const loadEmployee = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/compliance/me`, {
      credentials: "include",
    });
    if (!res.ok) {
      setErr("Could not load your verification history.");
      setLoading(false);
      return;
    }
    const j = await res.json();
    setMeLogs(j.logs ?? []);
    setMeSummary(j.summary ?? null);
    setLoading(false);
  }, [storeId]);

  const loadStore = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/compliance/dashboard`, {
      credentials: "include",
    });
    if (!res.ok) {
      setErr("Could not load compliance dashboard.");
      setLoading(false);
      return;
    }
    const j = await res.json();
    setToday(j.today);
    setTrend(j.trend30d ?? []);
    setScorecards(j.employeeScorecards ?? []);
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    if (mode === "employee") void loadEmployee();
    else void loadStore();
  }, [mode, loadEmployee, loadStore]);

  if (loading) return <main style={{ padding: 24 }}>Loading compliance…</main>;
  if (err) return <main style={{ padding: 24 }}>{err}</main>;

  if (mode === "employee") {
    return (
      <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <p>
          <Link href={`/store/${encodeURIComponent(storeId)}`} style={{ color: "#2563eb" }}>
            ← Store
          </Link>
        </p>
        <h1 style={{ marginTop: 0 }}>My age verifications</h1>
        <p style={{ opacity: 0.85, fontSize: 14 }}>
          Your verification history for this store. Store-wide compliance metrics are available to managers only.
        </p>
        {meSummary ? (
          <section style={{ marginBottom: 24, padding: 16, background: "#f9fafb", borderRadius: 8 }}>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>Last 30 days</h2>
            <p style={{ margin: "4px 0" }}>
              Age-restricted lines rung: <strong>{meSummary.last30Days?.ageRestrictedLineCount ?? 0}</strong>
            </p>
            <p style={{ margin: "4px 0" }}>
              Approved logs: <strong>{meSummary.last30Days?.approvedVerifications ?? 0}</strong> · Declined:{" "}
              <strong>{meSummary.last30Days?.declinedVerifications ?? 0}</strong> · Gaps (missing verification):{" "}
              <strong style={{ color: meSummary.last30Days?.gapCount ? "#b45309" : undefined }}>
                {meSummary.last30Days?.gapCount ?? 0}
              </strong>
            </p>
            <p style={{ margin: "4px 0", fontSize: 14 }}>
              Today: {meSummary.today.approved} approved, {meSummary.today.declined} declined (logged checks).
            </p>
          </section>
        ) : null}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th style={{ padding: 8 }}>Time</th>
                <th style={{ padding: 8 }}>Product</th>
                <th style={{ padding: 8 }}>Result</th>
                <th style={{ padding: 8 }}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {meLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 8, opacity: 0.7 }}>
                    No verification logs yet.
                  </td>
                </tr>
              ) : (
                meLogs.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8, whiteSpace: "nowrap" }}>{new Date(r.verifiedAt).toLocaleString()}</td>
                    <td style={{ padding: 8 }}>{r.productName}</td>
                    <td style={{ padding: 8 }}>{r.result}</td>
                    <td style={{ padding: 8 }}>{r.declinedReason ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    );
  }

  const chartData = trend.map((d) => ({
    ...d,
    rate: d.complianceRate ?? null,
  }));

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <p>
        <Link href={`/store/${encodeURIComponent(storeId)}`} style={{ color: "#2563eb" }}>
          ← Store
        </Link>{" "}
        ·{" "}
        <Link href={`${base}/pos-sim`} style={{ color: "#2563eb" }}>
          POS verification (simulator)
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Age compliance</h1>
      <p style={{ opacity: 0.85, maxWidth: 720 }}>
        Regulatory tracking for tobacco, alcohol, and other restricted products. Days flagged in the chart had an
        age-restricted sale with no verification log (compliance gap).
      </p>

      {today ? (
        <section style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 24 }}>
          <div style={{ padding: 16, background: "#f0fdf4", borderRadius: 8, minWidth: 160 }}>
            <div style={{ fontSize: 13, opacity: 0.8 }}>Approved today</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{today.approvedVerifications}</div>
          </div>
          <div style={{ padding: 16, background: "#fef2f2", borderRadius: 8, minWidth: 160 }}>
            <div style={{ fontSize: 13, opacity: 0.8 }}>Declined today</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{today.declinedVerifications}</div>
          </div>
          <div style={{ padding: 16, background: "#eff6ff", borderRadius: 8, minWidth: 160 }}>
            <div style={{ fontSize: 13, opacity: 0.8 }}>Compliance rate</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>
              {today.complianceRatePercent != null ? `${today.complianceRatePercent}%` : "—"}
            </div>
            <div style={{ fontSize: 12, opacity: 0.75 }}>Approved ÷ all logged verifications</div>
          </div>
        </section>
      ) : null}

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18 }}>30-day compliance rate trend</h2>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={4} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={(value) => [`${value ?? "—"}%`, "Compliance %"]} />
              <Legend />
              <Line type="monotone" dataKey="rate" name="Compliance %" stroke="#2563eb" dot={false} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p style={{ fontSize: 13, opacity: 0.8 }}>
          Gap flag (see table below): any day with missing verification on an age-restricted line item.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18 }}>Daily detail (30 days)</h2>
        <div style={{ overflowX: "auto", maxHeight: 280, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc", position: "sticky", top: 0, background: "#fff" }}>
                <th style={{ padding: 6 }}>Date</th>
                <th style={{ padding: 6 }}>Rate</th>
                <th style={{ padding: 6 }}>Logs</th>
                <th style={{ padding: 6 }}>Gaps</th>
              </tr>
            </thead>
            <tbody>
              {[...trend].reverse().map((d) => (
                <tr
                  key={d.date}
                  style={{
                    borderBottom: "1px solid #eee",
                    background: d.hasComplianceGap ? "#fff7ed" : undefined,
                  }}
                >
                  <td style={{ padding: 6 }}>{d.date}</td>
                  <td style={{ padding: 6 }}>{d.complianceRate != null ? `${d.complianceRate}%` : "—"}</td>
                  <td style={{ padding: 6 }}>{d.verificationCount}</td>
                  <td style={{ padding: 6 }}>{d.hasComplianceGap ? `⚠ ${d.gapCount}` : d.gapCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18 }}>Employee scorecard (last 30 days)</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th style={{ padding: 8 }}>Employee</th>
                <th style={{ padding: 8 }}>Age-restricted lines</th>
                <th style={{ padding: 8 }}>Approved</th>
                <th style={{ padding: 8 }}>Declined</th>
                <th style={{ padding: 8 }}>Gaps</th>
                <th style={{ padding: 8 }}>Verification rate</th>
              </tr>
            </thead>
            <tbody>
              {scorecards.map((s) => (
                <tr key={s.employeeId} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>
                    {s.name} <span style={{ opacity: 0.7 }}>({s.role})</span>
                  </td>
                  <td style={{ padding: 8 }}>{s.ageRestrictedLineCount}</td>
                  <td style={{ padding: 8 }}>{s.approvedVerifications}</td>
                  <td style={{ padding: 8 }}>{s.declinedVerifications}</td>
                  <td style={{ padding: 8, color: s.gapCount ? "#b45309" : undefined }}>{s.gapCount}</td>
                  <td style={{ padding: 8 }}>{s.verificationRate != null ? `${s.verificationRate}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
