"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ProgramRow = {
  id: string;
  programName: string;
  manufacturerName: string;
  rebateType: string;
  rebateValue: string;
  paymentFrequency: string;
  status: string;
  contactEmail: string;
  enrollmentDate: string;
  productCount: number;
};

type SubmissionRow = {
  id: string;
  programName: string;
  storeName: string;
  reportingPeriodStart: string;
  reportingPeriodEnd: string;
  totalQualifyingUnitsSold: number;
  totalRebateValueCalculated: string;
  status: string;
  paymentReceivedAt: string | null;
  paymentAmountReceived: string | null;
  paymentMismatch: boolean;
  fileFormat: string;
};

export default function AdminScanDataClient() {
  const [tab, setTab] = useState<"programs" | "submissions" | "revenue" | "stores">("programs");
  const [programs, setPrograms] = useState<ProgramRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [form, setForm] = useState({
    programName: "",
    manufacturerName: "",
    rebateType: "per_unit" as "per_unit" | "percentage",
    rebateValue: "0.25",
    paymentFrequency: "monthly" as "weekly" | "monthly" | "quarterly",
    contactEmail: "",
    enrollmentDate: new Date().toISOString().slice(0, 10),
    status: "active" as "active" | "paused" | "expired",
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    products: Array<{ productId: string; upc: string; name: string }>;
  } | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<Array<{ id: string; upc: string; name: string }>>([]);
  const [estimate, setEstimate] = useState<string | null>(null);

  const [report, setReport] = useState({
    programId: "",
    periodStart: "",
    periodEnd: "",
    fileFormat: "csv" as "csv" | "xml" | "api",
  });

  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [subFilters, setSubFilters] = useState({ programId: "", status: "", from: "", to: "" });

  const [revenue, setRevenue] = useState<{
    months: Array<{ month: string; total: number; byProgram: Array<{ programName: string; amount: number }> }>;
    yearToDate: number;
    priorYearToDateComparable: number;
  } | null>(null);

  const [storePerf, setStorePerf] = useState<
    Array<{ storeId: string; storeName: string; estimatedRebate90d: string }>
  >([]);

  const loadPrograms = useCallback(async () => {
    setErr(null);
    const r = await fetch("/api/admin/scan-data/programs", { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      setErr(j?.error ?? "Failed to load programs");
      return;
    }
    setPrograms(j.programs ?? []);
  }, []);

  const loadSubmissions = useCallback(async () => {
    const sp = new URLSearchParams();
    if (subFilters.programId) sp.set("programId", subFilters.programId);
    if (subFilters.status) sp.set("status", subFilters.status);
    if (subFilters.from) sp.set("from", subFilters.from);
    if (subFilters.to) sp.set("to", subFilters.to);
    const r = await fetch(`/api/admin/scan-data/submissions?${sp}`, { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (r.ok) setSubmissions(j.submissions ?? []);
  }, [subFilters]);

  const loadRevenue = useCallback(async () => {
    const r = await fetch("/api/admin/scan-data/revenue", { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (r.ok) setRevenue(j);
  }, []);

  const loadStores = useCallback(async () => {
    const r = await fetch("/api/admin/scan-data/store-performance", { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (r.ok) setStorePerf(j.stores ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      await loadPrograms();
      setLoading(false);
    })();
  }, [loadPrograms]);

  useEffect(() => {
    if (tab === "submissions") void loadSubmissions();
    if (tab === "revenue") void loadRevenue();
    if (tab === "stores") void loadStores();
  }, [tab, loadSubmissions, loadRevenue, loadStores]);

  useEffect(() => {
    if (selectedId) setReport((r) => ({ ...r, programId: selectedId }));
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void fetch(`/api/admin/scan-data/programs/${encodeURIComponent(selectedId)}`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.products) setDetail({ products: j.products });
      });
  }, [selectedId]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchQ.trim().length < 2) {
        setSearchHits([]);
        return;
      }
      void fetch(`/api/admin/pricebook?q=${encodeURIComponent(searchQ)}&active=true`, { credentials: "include" })
        .then((r) => r.json())
        .then((j) => {
          const rows = (j?.products ?? j?.rows ?? []) as Array<{ id: string; upc: string; name: string }>;
          setSearchHits(rows.slice(0, 12));
        });
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const revenueChartData = useMemo(() => {
    if (!revenue?.months) return [];
    const names = new Set<string>();
    for (const m of revenue.months) {
      for (const p of m.byProgram) names.add(p.programName);
    }
    const progNames = [...names];
    return revenue.months.map((m) => {
      const row: Record<string, string | number> = { month: m.month, total: m.total };
      for (const n of progNames) {
        row[n] = m.byProgram.find((x) => x.programName === n)?.amount ?? 0;
      }
      return row;
    });
  }, [revenue]);

  const chartPrograms = useMemo(() => {
    const s = new Set<string>();
    if (!revenue?.months) return [];
    for (const m of revenue.months) {
      for (const p of m.byProgram) s.add(p.programName);
    }
    return [...s];
  }, [revenue]);

  async function createProgram() {
    const r = await fetch("/api/admin/scan-data/programs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        programName: form.programName,
        manufacturerName: form.manufacturerName,
        rebateType: form.rebateType,
        rebateValue: Number(form.rebateValue),
        paymentFrequency: form.paymentFrequency,
        contactEmail: form.contactEmail,
        enrollmentDate: form.enrollmentDate,
        status: form.status,
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      setErr(j?.error ?? "Create failed");
      return;
    }
    setErr(null);
    await loadPrograms();
    if (j?.id) setSelectedId(j.id);
  }

  async function addProduct(pid: string) {
    if (!selectedId) return;
    await fetch(`/api/admin/scan-data/programs/${encodeURIComponent(selectedId)}/products`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ productId: pid }),
    });
    const r = await fetch(`/api/admin/scan-data/programs/${encodeURIComponent(selectedId)}`, {
      credentials: "include",
    });
    const j = await r.json();
    setDetail({ products: j.products ?? [] });
    await loadPrograms();
  }

  async function removeProduct(pid: string) {
    if (!selectedId) return;
    await fetch(
      `/api/admin/scan-data/programs/${encodeURIComponent(selectedId)}/products?productId=${encodeURIComponent(pid)}`,
      { method: "DELETE", credentials: "include" },
    );
    const r = await fetch(`/api/admin/scan-data/programs/${encodeURIComponent(selectedId)}`, {
      credentials: "include",
    });
    const j = await r.json();
    setDetail({ products: j.products ?? [] });
    await loadPrograms();
  }

  async function loadEstimate() {
    if (!selectedId) return;
    const r = await fetch(`/api/admin/scan-data/programs/${encodeURIComponent(selectedId)}/estimate`, {
      credentials: "include",
    });
    const j = await r.json().catch(() => null);
    if (r.ok) setEstimate(j.projectedMonthlyRebate ?? "—");
  }

  async function generateReport() {
    if (!report.programId || !report.periodStart || !report.periodEnd) return;
    const r = await fetch("/api/admin/scan-data/reports/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        programId: report.programId,
        periodStart: report.periodStart,
        periodEnd: report.periodEnd,
        fileFormat: report.fileFormat,
        createSubmissions: true,
      }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      setErr(j?.error ?? "Report failed");
      return;
    }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scan-data-report.csv";
    a.click();
    URL.revokeObjectURL(url);
    setErr(null);
    await loadSubmissions();
  }

  async function patchSubmission(
    id: string,
    patch: Partial<{
      status: string;
      paymentReceivedAt: string | null;
      paymentAmountReceived: number | null;
    }>,
  ) {
    await fetch(`/api/admin/scan-data/submissions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify(patch),
    });
    await loadSubmissions();
  }

  const colors = ["#2563eb", "#16a34a", "#ca8a04", "#dc2626", "#7c3aed", "#db2777"];

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <Link href="/store" style={{ color: "#2563eb" }}>
          ← Stores
        </Link>
      </div>
      <h1 style={{ marginTop: 0 }}>Scan data (admin)</h1>
      <p style={{ opacity: 0.8, maxWidth: 720 }}>
        Manage manufacturer programs, generate CSV reports, track submissions and payments.
      </p>

      {err ? <p style={{ color: "#b91c1c" }}>{err}</p> : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {(
          [
            ["programs", "Programs"],
            ["submissions", "Submissions"],
            ["revenue", "Revenue"],
            ["stores", "Store performance"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: tab === k ? "2px solid #2563eb" : "1px solid #ccc",
              background: tab === k ? "#eff6ff" : "#fff",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? <p>Loading…</p> : null}

      {tab === "programs" && !loading ? (
        <div style={{ display: "grid", gap: 24 }}>
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>New program</h2>
            <div style={{ display: "grid", gap: 8, maxWidth: 480 }}>
              <input
                placeholder="Program name"
                value={form.programName}
                onChange={(e) => setForm((f) => ({ ...f, programName: e.target.value }))}
                style={{ padding: 8 }}
              />
              <input
                placeholder="Manufacturer / sponsor"
                value={form.manufacturerName}
                onChange={(e) => setForm((f) => ({ ...f, manufacturerName: e.target.value }))}
                style={{ padding: 8 }}
              />
              <select
                value={form.rebateType}
                onChange={(e) => setForm((f) => ({ ...f, rebateType: e.target.value as "per_unit" | "percentage" }))}
                style={{ padding: 8 }}
              >
                <option value="per_unit">Rebate per unit ($)</option>
                <option value="percentage">% of retail</option>
              </select>
              <input
                placeholder={form.rebateType === "per_unit" ? "Dollars per unit" : "Percent (0–100)"}
                value={form.rebateValue}
                onChange={(e) => setForm((f) => ({ ...f, rebateValue: e.target.value }))}
                style={{ padding: 8 }}
              />
              <select
                value={form.paymentFrequency}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    paymentFrequency: e.target.value as "weekly" | "monthly" | "quarterly",
                  }))
                }
                style={{ padding: 8 }}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
              <input
                type="email"
                placeholder="Contact email"
                value={form.contactEmail}
                onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                style={{ padding: 8 }}
              />
              <input
                type="date"
                value={form.enrollmentDate}
                onChange={(e) => setForm((f) => ({ ...f, enrollmentDate: e.target.value }))}
                style={{ padding: 8 }}
              />
              <button type="button" onClick={() => void createProgram()} style={{ padding: "10px 16px" }}>
                Create program
              </button>
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 16 }}>Programs</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                  <th style={{ padding: 8 }}>Name</th>
                  <th style={{ padding: 8 }}>Manufacturer</th>
                  <th style={{ padding: 8 }}>Rebate</th>
                  <th style={{ padding: 8 }}>Frequency</th>
                  <th style={{ padding: 8 }}>Status</th>
                  <th style={{ padding: 8 }}>UPCs</th>
                </tr>
              </thead>
              <tbody>
                {programs.map((p) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f0f0f0", background: selectedId === p.id ? "#f8fafc" : undefined }}>
                    <td style={{ padding: 8 }}>
                      <button type="button" style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer" }} onClick={() => setSelectedId(p.id)}>
                        {p.programName}
                      </button>
                    </td>
                    <td style={{ padding: 8 }}>{p.manufacturerName}</td>
                    <td style={{ padding: 8 }}>
                      {p.rebateType === "per_unit" ? `$${p.rebateValue}/u` : `${p.rebateValue}%`}
                    </td>
                    <td style={{ padding: 8 }}>{p.paymentFrequency}</td>
                    <td style={{ padding: 8 }}>{p.status}</td>
                    <td style={{ padding: 8 }}>{p.productCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {selectedId ? (
            <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
              <h2 style={{ marginTop: 0, fontSize: 16 }}>Selected program — enroll UPCs</h2>
              <input
                placeholder="Search catalog (UPC, name)…"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                style={{ width: "100%", maxWidth: 400, padding: 8, marginBottom: 8 }}
              />
              {searchHits.length > 0 ? (
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {searchHits.map((h) => (
                    <li key={h.id} style={{ marginBottom: 6 }}>
                      <button type="button" onClick={() => void addProduct(h.id)} style={{ color: "#2563eb" }}>
                        + {h.upc} — {h.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {detail ? (
                <ul style={{ paddingLeft: 18 }}>
                  {detail.products.map((p) => (
                    <li key={p.productId} style={{ marginBottom: 4 }}>
                      {p.upc} {p.name}{" "}
                      <button type="button" onClick={() => void removeProduct(p.productId)} style={{ fontSize: 12 }}>
                        remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div style={{ marginTop: 12 }}>
                <button type="button" onClick={() => void loadEstimate()} style={{ marginRight: 8 }}>
                  Estimated monthly rebate (velocity)
                </button>
                {estimate != null ? <span style={{ fontWeight: 700 }}>${estimate}</span> : null}
              </div>

              <h3 style={{ fontSize: 14, marginTop: 20 }}>Generate report (CSV) + record submissions</h3>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <select
                  value={report.programId}
                  onChange={(e) => setReport((r) => ({ ...r, programId: e.target.value }))}
                  style={{ padding: 8 }}
                >
                  <option value="">— program —</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.programName}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={report.periodStart}
                  onChange={(e) => setReport((r) => ({ ...r, periodStart: e.target.value }))}
                />
                <input
                  type="date"
                  value={report.periodEnd}
                  onChange={(e) => setReport((r) => ({ ...r, periodEnd: e.target.value }))}
                />
                <button type="button" onClick={() => void generateReport()}>
                  Download CSV &amp; upsert submissions
                </button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === "submissions" ? (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            <select
              value={subFilters.programId}
              onChange={(e) => setSubFilters((s) => ({ ...s, programId: e.target.value }))}
              style={{ padding: 8 }}
            >
              <option value="">All programs</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.programName}
                </option>
              ))}
            </select>
            <select
              value={subFilters.status}
              onChange={(e) => setSubFilters((s) => ({ ...s, status: e.target.value }))}
              style={{ padding: 8 }}
            >
              <option value="">All statuses</option>
              <option value="pending">pending</option>
              <option value="submitted">submitted</option>
              <option value="confirmed">confirmed</option>
              <option value="paid">paid</option>
            </select>
            <input type="date" value={subFilters.from} onChange={(e) => setSubFilters((s) => ({ ...s, from: e.target.value }))} />
            <input type="date" value={subFilters.to} onChange={(e) => setSubFilters((s) => ({ ...s, to: e.target.value }))} />
            <button type="button" onClick={() => void loadSubmissions()}>
              Apply
            </button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                <th style={{ padding: 6 }}>Program</th>
                <th style={{ padding: 6 }}>Store</th>
                <th style={{ padding: 6 }}>Period</th>
                <th style={{ padding: 6 }}>Units</th>
                <th style={{ padding: 6 }}>Rebate calc</th>
                <th style={{ padding: 6 }}>Status</th>
                <th style={{ padding: 6 }}>Payment</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr
                  key={s.id}
                  style={{
                    borderBottom: "1px solid #f3f4f6",
                    background: s.paymentMismatch ? "#fffbeb" : undefined,
                  }}
                >
                  <td style={{ padding: 6 }}>{s.programName}</td>
                  <td style={{ padding: 6 }}>{s.storeName}</td>
                  <td style={{ padding: 6 }}>
                    {s.reportingPeriodStart} → {s.reportingPeriodEnd}
                  </td>
                  <td style={{ padding: 6 }}>{s.totalQualifyingUnitsSold}</td>
                  <td style={{ padding: 6 }}>${s.totalRebateValueCalculated}</td>
                  <td style={{ padding: 6 }}>
                    <select
                      value={s.status}
                      onChange={(e) => void patchSubmission(s.id, { status: e.target.value })}
                      style={{ fontSize: 12 }}
                    >
                      <option value="pending">pending</option>
                      <option value="submitted">submitted</option>
                      <option value="confirmed">confirmed</option>
                      <option value="paid">paid</option>
                    </select>
                  </td>
                  <td style={{ padding: 6, fontSize: 12 }}>
                    <input
                      type="date"
                      defaultValue={s.paymentReceivedAt ?? ""}
                      onBlur={(e) =>
                        void patchSubmission(s.id, { paymentReceivedAt: e.target.value || null })
                      }
                      style={{ width: 110 }}
                    />
                    <input
                      type="number"
                      step="0.01"
                      placeholder="amount"
                      defaultValue={s.paymentAmountReceived ?? ""}
                      onBlur={(ev) => {
                        const el = ev.target as HTMLInputElement;
                        void patchSubmission(s.id, {
                          paymentAmountReceived: el.value === "" ? null : Number(el.value),
                        });
                      }}
                      style={{ width: 80, marginLeft: 4 }}
                    />
                    {s.paymentMismatch ? <span style={{ color: "#b45309" }}> mismatch</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "revenue" && revenue ? (
        <div>
          <p>
            <strong>YTD paid:</strong> ${revenue.yearToDate.toFixed(2)} · <strong>Prior YTD (comparable):</strong> $
            {revenue.priorYearToDateComparable.toFixed(2)}
          </p>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={revenueChartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, ""]} />
                <Legend />
                {chartPrograms.length > 0 ?
                  chartPrograms.map((name, i) => (
                    <Bar key={name} dataKey={name} stackId="a" fill={colors[i % colors.length]!} name={name} />
                  ))
                : <Bar dataKey="total" fill="#2563eb" name="Total" />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}

      {tab === "stores" ? (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: 8 }}>Store</th>
              <th style={{ padding: 8 }}>Est. rebate (90d)</th>
            </tr>
          </thead>
          <tbody>
            {storePerf.map((s) => (
              <tr key={s.storeId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                <td style={{ padding: 8 }}>
                  <Link href={`/store/${encodeURIComponent(s.storeId)}/scan-data`} style={{ color: "#2563eb" }}>
                    {s.storeName}
                  </Link>
                </td>
                <td style={{ padding: 8 }}>${s.estimatedRebate90d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
