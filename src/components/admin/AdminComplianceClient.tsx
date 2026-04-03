"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type StoreRow = {
  storeId: string;
  storeName: string;
  approved: number;
  declined: number;
  totalVerifications: number;
  complianceRatePercent: number | null;
  ageRestrictedGapCount: number;
  flagged: boolean;
};

type EmpRow = {
  employeeId: string;
  name: string;
  role: string;
  ageRestrictedLineCount: number;
  approvedVerifications: number;
  declinedVerifications: number;
  gapCount: number;
  verificationRate: number | null;
};

export default function AdminComplianceClient() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detailStore, setDetailStore] = useState<string | null>(null);
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [employees, setEmployees] = useState<EmpRow[] | null>(null);
  const [rangeLabel, setRangeLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const p = new URLSearchParams();
    if (from) p.set("dateFrom", from);
    if (to) p.set("dateTo", to);
    if (detailStore) p.set("storeId", detailStore);
    const res = await fetch(`/api/admin/compliance/overview?${p.toString()}`, { credentials: "include" });
    if (!res.ok) {
      setErr("Failed to load overview.");
      setLoading(false);
      return;
    }
    const j = await res.json();
    setStores(j.stores ?? []);
    setEmployees(j.employeeScorecards ?? null);
    setRangeLabel(`${j.dateRange?.from ?? ""} → ${j.dateRange?.to ?? ""}`);
    setLoading(false);
  }, [from, to, detailStore]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportUrl(format: "csv" | "pdf") {
    const p = new URLSearchParams();
    if (from) p.set("dateFrom", from);
    if (to) p.set("dateTo", to);
    if (detailStore) p.set("storeId", detailStore);
    p.set("format", format);
    return `/api/admin/compliance/export?${p.toString()}`;
  }

  if (loading && stores.length === 0) return <main style={{ padding: 24 }}>Loading…</main>;
  if (err) return <main style={{ padding: 24 }}>{err}</main>;

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <p>
        <Link href="/store" style={{ color: "#2563eb" }}>
          ← Stores
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Chain age compliance</h1>
      <p style={{ opacity: 0.85, maxWidth: 720 }}>
        Rates use logged verifications (approved ÷ total checks). Stores are flagged if any age-restricted line sold
        without a verification log, or if the verification approval rate is below 100%.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 20 }}>
        <label style={{ display: "grid", gap: 4 }}>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <button type="button" onClick={() => void load()}>
          Apply
        </button>
        <span style={{ fontSize: 14, opacity: 0.8 }}>{rangeLabel}</span>
        <a href={exportUrl("csv")} style={{ color: "#2563eb", fontSize: 14 }}>
          Export CSV
        </a>
        <a href={exportUrl("pdf")} style={{ color: "#2563eb", fontSize: 14 }}>
          Export PDF
        </a>
      </div>

      <label style={{ display: "block", marginBottom: 16, maxWidth: 360 }}>
        Drill-down — employee scorecards for store
        <select
          value={detailStore ?? ""}
          onChange={(e) => setDetailStore(e.target.value || null)}
          style={{ display: "block", width: "100%", marginTop: 6, padding: 8 }}
        >
          <option value="">Chain only (no employee table)</option>
          {stores.map((s) => (
            <option key={s.storeId} value={s.storeId}>
              {s.storeName}
            </option>
          ))}
        </select>
      </label>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18 }}>By store</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th style={{ padding: 8 }}>Store</th>
                <th style={{ padding: 8 }}>Approved</th>
                <th style={{ padding: 8 }}>Declined</th>
                <th style={{ padding: 8 }}>Total checks</th>
                <th style={{ padding: 8 }}>Rate</th>
                <th style={{ padding: 8 }}>Gaps</th>
                <th style={{ padding: 8 }}>Flagged</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr
                  key={s.storeId}
                  style={{
                    borderBottom: "1px solid #eee",
                    background: s.flagged ? "#fff7ed" : undefined,
                  }}
                >
                  <td style={{ padding: 8 }}>
                    <Link href={`/store/${encodeURIComponent(s.storeId)}/compliance`} style={{ color: "#2563eb" }}>
                      {s.storeName}
                    </Link>
                  </td>
                  <td style={{ padding: 8 }}>{s.approved}</td>
                  <td style={{ padding: 8 }}>{s.declined}</td>
                  <td style={{ padding: 8 }}>{s.totalVerifications}</td>
                  <td style={{ padding: 8 }}>
                    {s.complianceRatePercent != null ? `${s.complianceRatePercent}%` : "—"}
                  </td>
                  <td style={{ padding: 8 }}>{s.ageRestrictedGapCount}</td>
                  <td style={{ padding: 8 }}>{s.flagged ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {employees && employees.length > 0 ? (
        <section>
          <h2 style={{ fontSize: 18 }}>Employee scorecards (selected store)</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                  <th style={{ padding: 8 }}>Employee</th>
                  <th style={{ padding: 8 }}>Lines</th>
                  <th style={{ padding: 8 }}>Approved</th>
                  <th style={{ padding: 8 }}>Declined</th>
                  <th style={{ padding: 8 }}>Gaps</th>
                  <th style={{ padding: 8 }}>Rate</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.employeeId} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 8 }}>
                      {e.name} <span style={{ opacity: 0.7 }}>({e.role})</span>
                    </td>
                    <td style={{ padding: 8 }}>{e.ageRestrictedLineCount}</td>
                    <td style={{ padding: 8 }}>{e.approvedVerifications}</td>
                    <td style={{ padding: 8 }}>{e.declinedVerifications}</td>
                    <td style={{ padding: 8 }}>{e.gapCount}</td>
                    <td style={{ padding: 8 }}>{e.verificationRate != null ? `${e.verificationRate}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
