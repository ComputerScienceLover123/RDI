"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

const REPORT_TYPES: { value: string; label: string }[] = [
  { value: "sales_summary", label: "Sales summary" },
  { value: "inventory_valuation", label: "Inventory valuation" },
  { value: "purchase_order_summary", label: "Purchase order summary" },
  { value: "labor_summary", label: "Labor summary" },
  { value: "fuel_performance", label: "Fuel performance" },
  { value: "foodservice", label: "Foodservice" },
  { value: "lottery", label: "Lottery" },
  { value: "scan_data", label: "Scan data" },
  { value: "shrinkage", label: "Shrinkage" },
];

const PRESETS: { value: string; label: string }[] = [
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_month", label: "Last calendar month" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "custom_range", label: "Custom (fixed dates in template)" },
];

export default function AdminReportsClient() {
  const [tab, setTab] = useState<"builder" | "templates" | "history">("builder");
  const [stores, setStores] = useState<Array<{ id: string; name: string }>>([]);

  const [reportType, setReportType] = useState("sales_summary");
  const [storeScope, setStoreScope] = useState<"all" | "subset" | "single">("all");
  const [subsetIds, setSubsetIds] = useState<string[]>([]);
  const [singleId, setSingleId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const [templates, setTemplates] = useState<
    Array<{
      id: string;
      name: string;
      reportType: string;
      storeScope: string;
      datePreset: string;
      schedules: Array<{ id: string; frequency: string; enabled: boolean }>;
    }>
  >([]);

  const [history, setHistory] = useState<
    Array<{
      id: string;
      displayName: string;
      reportType: string;
      dateFrom: string;
      dateTo: string;
      generatedByName: string;
      createdAt: string;
    }>
  >([]);

  const [tplForm, setTplForm] = useState({
    name: "",
    reportType: "sales_summary",
    storeScope: "all" as "all" | "subset" | "single",
    datePreset: "last_7_days",
    customFrom: "",
    customTo: "",
  });
  const [tplSubset, setTplSubset] = useState<string[]>([]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadStores = useCallback(async () => {
    const r = await fetch("/api/admin/reports/stores", { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (r.ok) setStores(j.stores ?? []);
  }, []);

  const loadTemplates = useCallback(async () => {
    const r = await fetch("/api/admin/reports/templates", { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (r.ok) setTemplates(j.templates ?? []);
  }, []);

  const loadHistory = useCallback(async () => {
    const r = await fetch("/api/admin/reports/history", { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (r.ok) setHistory(j.reports ?? []);
  }, []);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  useEffect(() => {
    if (tab === "templates") void loadTemplates();
    if (tab === "history") void loadHistory();
  }, [tab, loadTemplates, loadHistory]);

  const defaultDates = useMemo(() => {
    const t = new Date();
    const f = new Date(t);
    f.setDate(f.getDate() - 29);
    const pad = (n: number) => String(n).padStart(2, "0");
    const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { from: ymd(f), to: ymd(t) };
  }, []);

  useEffect(() => {
    if (!from && !to) {
      setFrom(defaultDates.from);
      setTo(defaultDates.to);
    }
  }, [defaultDates, from, to]);

  async function generate(fmt: "csv" | "pdf") {
    const scope = storeScope;
    let storeIds: string[] | undefined;
    if (scope === "subset") storeIds = subsetIds;
    if (scope === "single") storeIds = singleId ? [singleId] : [];

    const r = await fetch("/api/admin/reports/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        reportType,
        storeScope: scope,
        storeIds: scope === "all" ? [] : storeIds,
        from,
        to,
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Generation failed");
      return;
    }
    const id = j.id as string;
    window.open(`/api/admin/reports/download/${encodeURIComponent(id)}?format=${fmt}`, "_blank");
    showToast("Report saved — downloading…");
    void loadHistory();
  }

  async function saveTemplate() {
    const storeIds =
      tplForm.storeScope === "all" ? [] : tplForm.storeScope === "single" ? (tplSubset[0] ? [tplSubset[0]] : []) : tplSubset;
    const r = await fetch("/api/admin/reports/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: tplForm.name,
        reportType: tplForm.reportType,
        storeScope: tplForm.storeScope,
        storeIds,
        datePreset: tplForm.datePreset,
        customDateFrom: tplForm.datePreset === "custom_range" ? tplForm.customFrom : undefined,
        customDateTo: tplForm.datePreset === "custom_range" ? tplForm.customTo : undefined,
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Save failed");
      return;
    }
    showToast("Template saved");
    setTplForm((f) => ({ ...f, name: "" }));
    void loadTemplates();
  }

  async function runTemplate(id: string) {
    const r = await fetch(`/api/admin/reports/templates/${encodeURIComponent(id)}`, {
      method: "POST",
      credentials: "include",
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Run failed");
      return;
    }
    window.open(`/api/admin/reports/download/${encodeURIComponent(j.id)}?format=csv`, "_blank");
    showToast("Template run — CSV downloading");
    void loadHistory();
  }

  async function addSchedule(templateId: string, frequency: string) {
    await fetch("/api/admin/reports/schedules", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ templateId, frequency }),
    });
    void loadTemplates();
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      {toast ? (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#111",
            color: "#fff",
            padding: "12px 16px",
            borderRadius: 8,
            zIndex: 200,
          }}
        >
          {toast}
        </div>
      ) : null}

      <Link href="/store" style={{ color: "#2563eb" }}>
        ← Stores
      </Link>
      <h1 style={{ marginTop: 12 }}>HQ reports</h1>
      <p style={{ opacity: 0.8 }}>
        Chain-wide exports (admin only). Files are retained 90 days. Schedule automated runs via cron calling{" "}
        <code>/api/cron/hq-reports</code> with <code>CRON_SECRET</code>.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {(
          [
            ["builder", "Report builder"],
            ["templates", "Saved templates"],
            ["history", "History"],
          ] as const
        ).map(([k, lab]) => (
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
            {lab}
          </button>
        ))}
      </div>

      {tab === "builder" ? (
        <div style={{ display: "grid", gap: 16, maxWidth: 520 }}>
          <label>
            Report type
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            >
              {REPORT_TYPES.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stores
            <select
              value={storeScope}
              onChange={(e) => setStoreScope(e.target.value as "all" | "subset" | "single")}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            >
              <option value="all">All stores</option>
              <option value="subset">Subset</option>
              <option value="single">Single store</option>
            </select>
          </label>
          {storeScope === "subset" ? (
            <select
              multiple
              value={subsetIds}
              onChange={(e) =>
                setSubsetIds(Array.from(e.target.selectedOptions).map((o) => o.value))
              }
              style={{ minHeight: 120, width: "100%" }}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : null}
          {storeScope === "single" ? (
            <select value={singleId} onChange={(e) => setSingleId(e.target.value)} style={{ padding: 8 }}>
              <option value="">— Select —</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : null}
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ flex: 1 }}>
              From
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} />
            </label>
            <label style={{ flex: 1 }}>
              To
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }} />
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => void generate("csv")} style={{ padding: "10px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8 }}>
              Generate &amp; download CSV
            </button>
            <button type="button" onClick={() => void generate("pdf")} style={{ padding: "10px 18px", background: "#111", color: "#fff", border: "none", borderRadius: 8 }}>
              Generate &amp; download PDF
            </button>
          </div>
        </div>
      ) : null}

      {tab === "templates" ? (
        <div style={{ display: "grid", gap: 24 }}>
          <section style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Save current settings as template</h2>
            <input
              placeholder="Template name"
              value={tplForm.name}
              onChange={(e) => setTplForm((f) => ({ ...f, name: e.target.value }))}
              style={{ width: "100%", maxWidth: 360, padding: 8, marginBottom: 8 }}
            />
            <div style={{ display: "grid", gap: 8, maxWidth: 400 }}>
              <select
                value={tplForm.reportType}
                onChange={(e) => setTplForm((f) => ({ ...f, reportType: e.target.value }))}
                style={{ padding: 8 }}
              >
                {REPORT_TYPES.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
              <select
                value={tplForm.storeScope}
                onChange={(e) =>
                  setTplForm((f) => ({ ...f, storeScope: e.target.value as "all" | "subset" | "single" }))
                }
                style={{ padding: 8 }}
              >
                <option value="all">All stores</option>
                <option value="subset">Subset (pick below)</option>
                <option value="single">Single (first selected)</option>
              </select>
              <select
                multiple
                value={tplSubset}
                onChange={(e) =>
                  setTplSubset(Array.from(e.target.selectedOptions).map((o) => o.value))
                }
                style={{ minHeight: 100 }}
              >
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={tplForm.datePreset}
                onChange={(e) => setTplForm((f) => ({ ...f, datePreset: e.target.value }))}
                style={{ padding: 8 }}
              >
                {PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              {tplForm.datePreset === "custom_range" ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="date"
                    value={tplForm.customFrom}
                    onChange={(e) => setTplForm((f) => ({ ...f, customFrom: e.target.value }))}
                  />
                  <input
                    type="date"
                    value={tplForm.customTo}
                    onChange={(e) => setTplForm((f) => ({ ...f, customTo: e.target.value }))}
                  />
                </div>
              ) : null}
              <button type="button" onClick={() => void saveTemplate()} style={{ padding: "10px 16px" }}>
                Save template
              </button>
            </div>
          </section>

          <section>
            <h2 style={{ fontSize: 16 }}>Saved templates</h2>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {templates.map((t) => (
                <li
                  key={t.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <strong>{t.name}</strong> · {t.reportType} · {t.datePreset}
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <button type="button" onClick={() => void runTemplate(t.id)}>
                      Run now
                    </button>
                    <button type="button" onClick={() => void addSchedule(t.id, "daily")}>
                      + Daily schedule
                    </button>
                    <button type="button" onClick={() => void addSchedule(t.id, "weekly_monday")}>
                      + Weekly Mon
                    </button>
                    <button type="button" onClick={() => void addSchedule(t.id, "monthly_first")}>
                      + Monthly 1st
                    </button>
                  </div>
                  {t.schedules.length > 0 ? (
                    <ul style={{ fontSize: 13, opacity: 0.9 }}>
                      {t.schedules.map((s) => (
                        <li key={s.id}>
                          {s.frequency} {s.enabled ? "" : "(off)"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === "history" ? (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: 8 }}>Name</th>
              <th style={{ padding: 8 }}>Type</th>
              <th style={{ padding: 8 }}>Period</th>
              <th style={{ padding: 8 }}>By</th>
              <th style={{ padding: 8 }}>Download</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: 8 }}>{h.displayName}</td>
                <td style={{ padding: 8 }}>{h.reportType}</td>
                <td style={{ padding: 8 }}>
                  {h.dateFrom} → {h.dateTo}
                </td>
                <td style={{ padding: 8 }}>{h.generatedByName}</td>
                <td style={{ padding: 8 }}>
                  <a href={`/api/admin/reports/download/${encodeURIComponent(h.id)}?format=csv`} style={{ color: "#2563eb", marginRight: 10 }}>
                    CSV
                  </a>
                  <a href={`/api/admin/reports/download/${encodeURIComponent(h.id)}?format=pdf`} style={{ color: "#2563eb" }}>
                    PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
