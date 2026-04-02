"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserRole } from "@prisma/client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { defaultChartRange } from "@/lib/sales/dates";

const PIE_COLORS = [
  "#2563eb",
  "#16a34a",
  "#ca8a04",
  "#dc2626",
  "#9333ea",
  "#0891b2",
  "#ea580c",
  "#4f46e5",
  "#db2777",
  "#64748b",
];

type Summary = {
  asOf: string;
  today: { totalSales: number; transactionCount: number; averageTransaction: number };
  sameWeekdayLastWeek: { totalSales: number; transactionCount: number };
  salesPctChangeVsSameWeekdayLastWeek: number | null;
  monthToDate: { totalSales: number; monthLabel: string };
  voidRefundAlert: { todayCount: number; priorSevenDayAvgDaily: number; warning: boolean };
};

type DailyRow = { date: string; grossSales: number; netSales: number; saleCount: number };
type TopRow = { productId: string; name: string; category: string; unitsSold: number; revenue: number };
type CatRow = { category: string; revenue: number; pct: number };
type HourRow = { hour: number; transactionCount: number; intensity: number };

type TxnRow = {
  id: string;
  transactionAt: string;
  type: string;
  paymentMethod: string;
  itemCount: number;
  total: number;
  employee: { id: string; name: string };
};

type LineItemRow = {
  id: string;
  productName: string;
  category: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discountAmount: number;
};

type StoreSummary = {
  storeId: string;
  storeName: string;
  todaySales: number;
  monthToDateSales: number;
  todayTransactionCount: number;
};

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function pctChangeDisplay(pct: number | null) {
  if (pct === null) return { text: "—", up: null as boolean | null };
  const up = pct >= 0;
  return { text: `${up ? "+" : ""}${pct.toFixed(1)}%`, up };
}

function tooltipMoney(v: unknown) {
  if (typeof v === "number") return money(v);
  if (typeof v === "string" && v !== "") {
    const n = Number(v);
    if (!Number.isNaN(n)) return money(n);
  }
  return String(v ?? "");
}

export default function SalesDashboardClient(props: { storeId: string; storeName: string; userRole: UserRole }) {
  const { storeId, storeName, userRole } = props;
  const def = useMemo(() => defaultChartRange(), []);
  const [from, setFrom] = useState(def.from);
  const [to, setTo] = useState(def.to);
  const [chartKind, setChartKind] = useState<"line" | "bar">("line");

  const [summary, setSummary] = useState<Summary | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [topByRev, setTopByRev] = useState<TopRow[]>([]);
  const [topByUnits, setTopByUnits] = useState<TopRow[]>([]);
  const [categories, setCategories] = useState<CatRow[]>([]);
  const [hourly, setHourly] = useState<HourRow[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);

  const [txnType, setTxnType] = useState<string>("all");
  const [txnPay, setTxnPay] = useState("all");
  const [txnEmployee, setTxnEmployee] = useState("all");
  const [txnQ, setTxnQ] = useState("");
  const [txnPage, setTxnPage] = useState(1);
  const [txnLoading, setTxnLoading] = useState(false);
  const [txnData, setTxnData] = useState<{
    transactions: TxnRow[];
    total: number;
    totalPages: number;
  } | null>(null);

  const [detailTxnId, setDetailTxnId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailBody, setDetailBody] = useState<{
    transaction: {
      id: string;
      transactionAt: string;
      type: string;
      paymentMethod: string;
      subtotal: number;
      taxAmount: number;
      total: number;
      terminalId: string;
      itemCount: number;
      employee: { id: string; name: string };
    };
    lineItems: LineItemRow[];
  } | null>(null);

  const [adminStores, setAdminStores] = useState<StoreSummary[] | null>(null);

  const canLineDetail = userRole === "admin" || userRole === "manager";
  const canExport = userRole === "admin" || userRole === "manager";

  const base = `/api/store/${encodeURIComponent(storeId)}/sales`;

  const loadSummary = useCallback(async () => {
    const res = await fetch(`${base}/summary`, { credentials: "include" });
    if (res.ok) setSummary(await res.json());
  }, [base]);

  const loadRange = useCallback(async () => {
    const q = new URLSearchParams({ from, to });
    const [d, t, c, h] = await Promise.all([
      fetch(`${base}/daily?${q}`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${base}/top-products?${q}`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${base}/by-category?${q}`, { credentials: "include" }).then((r) => r.json()),
      fetch(`${base}/hourly?${q}`, { credentials: "include" }).then((r) => r.json()),
    ]);
    if (d.days) setDaily(d.days);
    if (t.byRevenue) {
      setTopByRev(t.byRevenue);
      setTopByUnits(t.byUnits);
    }
    if (c.categories) setCategories(c.categories);
    if (h.hours) setHourly(h.hours);
  }, [base, from, to]);

  const loadTxns = useCallback(async () => {
    setTxnLoading(true);
    const q = new URLSearchParams({ from, to, page: String(txnPage) });
    if (txnType === "void_refund") q.set("types", "void,refund");
    else if (txnType !== "all") q.set("type", txnType);
    if (txnPay !== "all") q.set("paymentMethod", txnPay);
    if (txnEmployee !== "all") q.set("employeeId", txnEmployee);
    if (txnQ.trim()) q.set("q", txnQ.trim());
    const res = await fetch(`${base}/transactions?${q}`, { credentials: "include" });
    if (res.ok) {
      const j = await res.json();
      setTxnData({
        transactions: j.transactions,
        total: j.total,
        totalPages: j.totalPages,
      });
    }
    setTxnLoading(false);
  }, [base, from, to, txnPage, txnType, txnPay, txnEmployee, txnQ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const focus = new URLSearchParams(window.location.search).get("focus");
    if (focus === "void_refund") setTxnType("void_refund");
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadRange();
  }, [loadRange]);

  useEffect(() => {
    void loadTxns();
  }, [loadTxns]);

  useEffect(() => {
    void fetch(`${base}/staff`, { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.staff) setStaff(j.staff);
      });
  }, [base]);

  useEffect(() => {
    if (userRole !== "admin") return;
    void fetch("/api/admin/sales/stores-summary", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.stores) setAdminStores(j.stores);
      });
  }, [userRole]);

  useEffect(() => {
    setTxnPage(1);
  }, [from, to, txnType, txnPay, txnEmployee, txnQ]);

  const openDetail = async (id: string) => {
    if (!canLineDetail) return;
    setDetailTxnId(id);
    setDetailBody(null);
    setDetailLoading(true);
    const res = await fetch(`${base}/transactions/${encodeURIComponent(id)}`, { credentials: "include" });
    if (res.ok) setDetailBody(await res.json());
    setDetailLoading(false);
  };

  const exportCsv = async () => {
    const q = new URLSearchParams({ from, to, format: "csv" });
    if (txnType === "void_refund") q.set("types", "void,refund");
    else if (txnType !== "all") q.set("type", txnType);
    if (txnPay !== "all") q.set("paymentMethod", txnPay);
    if (txnEmployee !== "all") q.set("employeeId", txnEmployee);
    if (txnQ.trim()) q.set("q", txnQ.trim());
    const res = await fetch(`${base}/transactions?${q}`, { credentials: "include" });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${storeId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pct = summary ? pctChangeDisplay(summary.salesPctChangeVsSameWeekdayLastWeek) : null;
  const chartData = daily.map((d) => ({ ...d, label: d.date.slice(5) }));

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <Link href={`/store/${encodeURIComponent(storeId)}`} style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Store dashboard
        </Link>
        {userRole === "admin" ? (
          <Link href="/admin/sales" style={{ color: "#2563eb", textDecoration: "none", marginLeft: 8 }}>
            All stores comparison
          </Link>
        ) : null}
      </div>

      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 4px" }}>Sales &amp; reporting</h1>
        <p style={{ margin: 0, opacity: 0.8 }}>
          {storeName} · Reporting uses the server local calendar day for &quot;today&quot; and charts.
        </p>
      </header>

      {userRole === "admin" && adminStores && adminStores.length > 0 ? (
        <section
          style={{
            marginBottom: 28,
            padding: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            background: "#fafafa",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Multi-store snapshot (admin)</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
                  <th style={{ padding: "8px 6px" }}>Store</th>
                  <th style={{ padding: "8px 6px" }}>Today sales</th>
                  <th style={{ padding: "8px 6px" }}>Today txns</th>
                  <th style={{ padding: "8px 6px" }}>MTD sales</th>
                  <th style={{ padding: "8px 6px" }} />
                </tr>
              </thead>
              <tbody>
                {adminStores.map((s) => (
                  <tr key={s.storeId} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: "8px 6px" }}>{s.storeName}</td>
                    <td style={{ padding: "8px 6px" }}>{money(s.todaySales)}</td>
                    <td style={{ padding: "8px 6px" }}>{s.todayTransactionCount}</td>
                    <td style={{ padding: "8px 6px" }}>{money(s.monthToDateSales)}</td>
                    <td style={{ padding: "8px 6px" }}>
                      {s.storeId === storeId ? (
                        <span style={{ opacity: 0.6 }}>Viewing</span>
                      ) : (
                        <Link href={`/store/${encodeURIComponent(s.storeId)}/sales`} style={{ color: "#2563eb" }}>
                          Open
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {summary ? (
        <section style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 18, marginBottom: 12 }}>Today at a glance</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: 12,
            }}
          >
            <div style={cardStyle}>
              <div style={labelStyle}>Total sales</div>
              <div style={valueStyle}>{money(summary.today.totalSales)}</div>
              {pct && pct.up !== null ? (
                <div style={{ fontSize: 13, marginTop: 6, color: pct.up ? "#16a34a" : "#dc2626" }}>
                  {pct.up ? "▲" : "▼"} vs same weekday last week {pct.text}
                </div>
              ) : (
                <div style={{ fontSize: 13, marginTop: 6, opacity: 0.7 }}>vs last week: {pct?.text}</div>
              )}
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Transactions</div>
              <div style={valueStyle}>{summary.today.transactionCount}</div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Avg ticket</div>
              <div style={valueStyle}>{money(summary.today.averageTransaction)}</div>
            </div>
            <div style={cardStyle}>
              <div style={labelStyle}>Month-to-date</div>
              <div style={valueStyle}>{money(summary.monthToDate.totalSales)}</div>
              <div style={{ fontSize: 12, marginTop: 4, opacity: 0.75 }}>{summary.monthToDate.monthLabel}</div>
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 8,
              border: summary.voidRefundAlert.warning ? "2px solid #f59e0b" : "1px solid #e5e7eb",
              background: summary.voidRefundAlert.warning ? "#fffbeb" : "#f9fafb",
            }}
          >
            <strong>Voids &amp; refunds today:</strong> {summary.voidRefundAlert.todayCount} · 7-day avg (prior days):{" "}
            {summary.voidRefundAlert.priorSevenDayAvgDaily.toFixed(2)} / day
            {summary.voidRefundAlert.warning ? (
              <span style={{ marginLeft: 8, color: "#b45309", fontWeight: 600 }}>Above normal — review activity</span>
            ) : null}
          </div>
        </section>
      ) : null}

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Report period</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </label>
          <button
            type="button"
            onClick={() => {
              const d = defaultChartRange();
              setFrom(d.from);
              setTo(d.to);
            }}
            style={btnSecondary}
          >
            Last 30 days
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Daily sales</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setChartKind("line")} style={chartKind === "line" ? btnPrimary : btnSecondary}>
              Line
            </button>
            <button type="button" onClick={() => setChartKind("bar")} style={chartKind === "bar" ? btnPrimary : btnSecondary}>
              Bars
            </button>
          </div>
        </div>
        <div style={{ width: "100%", height: 320, marginTop: 12 }}>
          <ResponsiveContainer width="100%" height="100%">
            {chartKind === "line" ? (
              <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={tooltipMoney}
                  labelFormatter={(_, payload) => {
                    const p = payload?.[0]?.payload as DailyRow | undefined;
                    return p?.date ?? "";
                  }}
                />
                <Line type="monotone" dataKey="grossSales" name="Gross sales" stroke="#2563eb" strokeWidth={2} dot={false} />
              </LineChart>
            ) : (
              <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={tooltipMoney} />
                <Bar dataKey="grossSales" name="Gross sales" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20,
          marginBottom: 28,
        }}
      >
        <section>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>Top 10 by revenue</h3>
          <TopTable rows={topByRev} />
        </section>
        <section>
          <h3 style={{ fontSize: 16, marginBottom: 8 }}>Top 10 by units</h3>
          <TopTable rows={topByUnits} />
        </section>
      </div>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Revenue by category</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
          <div style={{ width: 280, height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categories}
                  dataKey="revenue"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={56}
                  outerRadius={88}
                  paddingAngle={1}
                >
                  {categories.map((c, i) => (
                    <Cell key={c.category} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={tooltipMoney} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            {categories.map((c, i) => (
              <li key={c.category} style={{ marginBottom: 6 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: PIE_COLORS[i % PIE_COLORS.length],
                    marginRight: 8,
                  }}
                />
                {c.category}: {money(c.revenue)} ({c.pct}%)
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Hourly transaction volume</h2>
        <p style={{ fontSize: 13, opacity: 0.8, marginTop: 0 }}>Count of all transactions by hour of day (server local time).</p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
            gap: 4,
            maxWidth: "100%",
          }}
        >
          {hourly.map((h) => (
            <div
              key={h.hour}
              title={`${h.hour}:00 — ${h.transactionCount} txns`}
              style={{
                minHeight: 48,
                borderRadius: 4,
                background: `rgba(37, 99, 235, ${0.12 + h.intensity * 0.78})`,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                fontSize: 10,
                padding: 2,
                color: h.intensity > 0.4 ? "#fff" : "#1e3a5f",
              }}
            >
              <span style={{ marginBottom: 2 }}>{h.hour}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Transaction log</h2>
          {canExport ? (
            <button type="button" onClick={() => exportCsv()} style={btnSecondary}>
              Export CSV
            </button>
          ) : (
            <span style={{ fontSize: 13, opacity: 0.7 }}>Export available to managers and admins.</span>
          )}
        </div>
        {!canLineDetail ? (
          <p style={{ fontSize: 13, opacity: 0.8 }}>Line-item detail is available to managers and admins only.</p>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, marginBottom: 12 }}>
          <select value={txnType} onChange={(e) => setTxnType(e.target.value)} style={inputStyle}>
            <option value="all">All types</option>
            <option value="sale">Sale</option>
            <option value="refund">Refund</option>
            <option value="void">Void</option>
            <option value="void_refund">Voids &amp; refunds</option>
          </select>
          <select value={txnPay} onChange={(e) => setTxnPay(e.target.value)} style={inputStyle}>
            <option value="all">All payments</option>
            <option value="cash">Cash</option>
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
            <option value="mobile">Mobile</option>
          </select>
          <select value={txnEmployee} onChange={(e) => setTxnEmployee(e.target.value)} style={inputStyle}>
            <option value="all">All staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="search"
            placeholder="Search transaction ID"
            value={txnQ}
            onChange={(e) => setTxnQ(e.target.value)}
            style={{ ...inputStyle, minWidth: 200 }}
          />
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>ID</th>
                <th style={thStyle}>Employee</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Payment</th>
                <th style={thStyle}>Items</th>
                <th style={thStyle}>Total</th>
              </tr>
            </thead>
            <tbody>
              {txnLoading ? (
                <tr>
                  <td colSpan={7} style={{ padding: 16, opacity: 0.7 }}>
                    Loading…
                  </td>
                </tr>
              ) : null}
              {txnData?.transactions.map((t) => {
                const rowBg =
                  t.type === "refund" ? "#fef2f2" : t.type === "void" ? "#fff7ed" : undefined;
                return (
                  <tr
                    key={t.id}
                    onClick={() => void openDetail(t.id)}
                    style={{
                      borderBottom: "1px solid #eee",
                      background: rowBg,
                      cursor: canLineDetail ? "pointer" : "default",
                    }}
                  >
                    <td style={tdStyle}>{new Date(t.transactionAt).toLocaleString()}</td>
                    <td style={tdStyle}>
                      <code style={{ fontSize: 11 }}>{t.id.slice(0, 12)}…</code>
                    </td>
                    <td style={tdStyle}>{t.employee.name}</td>
                    <td style={tdStyle}>{t.type}</td>
                    <td style={tdStyle}>{t.paymentMethod}</td>
                    <td style={tdStyle}>{t.itemCount}</td>
                    <td style={tdStyle}>{money(t.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {txnData && txnData.totalPages > 1 ? (
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
            <button
              type="button"
              disabled={txnPage <= 1}
              onClick={() => setTxnPage((p) => p - 1)}
              style={btnSecondary}
            >
              Prev
            </button>
            <span style={{ fontSize: 14 }}>
              Page {txnPage} / {txnData.totalPages} ({txnData.total} total)
            </span>
            <button
              type="button"
              disabled={txnPage >= txnData.totalPages}
              onClick={() => setTxnPage((p) => p + 1)}
              style={btnSecondary}
            >
              Next
            </button>
          </div>
        ) : null}
      </section>

      {detailTxnId ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 16,
          }}
          onClick={() => {
            setDetailTxnId(null);
            setDetailBody(null);
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 10,
              maxWidth: 640,
              width: "100%",
              maxHeight: "90vh",
              overflow: "auto",
              padding: 20,
              boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <h3 style={{ marginTop: 0 }}>Transaction detail</h3>
              <button
                type="button"
                onClick={() => {
                  setDetailTxnId(null);
                  setDetailBody(null);
                }}
                style={btnSecondary}
              >
                Close
              </button>
            </div>
            {detailLoading || !detailBody ? (
              <p style={{ opacity: 0.8 }}>Loading…</p>
            ) : (
              <>
                <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", fontSize: 14 }}>
                  <dt style={{ opacity: 0.7 }}>Time</dt>
                  <dd style={{ margin: 0 }}>{new Date(detailBody.transaction.transactionAt).toLocaleString()}</dd>
                  <dt style={{ opacity: 0.7 }}>ID</dt>
                  <dd style={{ margin: 0 }}>
                    <code style={{ fontSize: 12 }}>{detailBody.transaction.id}</code>
                  </dd>
                  <dt style={{ opacity: 0.7 }}>Employee</dt>
                  <dd style={{ margin: 0 }}>{detailBody.transaction.employee.name}</dd>
                  <dt style={{ opacity: 0.7 }}>Type</dt>
                  <dd style={{ margin: 0 }}>{detailBody.transaction.type}</dd>
                  <dt style={{ opacity: 0.7 }}>Payment</dt>
                  <dd style={{ margin: 0 }}>{detailBody.transaction.paymentMethod}</dd>
                  <dt style={{ opacity: 0.7 }}>Items</dt>
                  <dd style={{ margin: 0 }}>{detailBody.transaction.itemCount}</dd>
                  <dt style={{ opacity: 0.7 }}>Subtotal / tax / total</dt>
                  <dd style={{ margin: 0 }}>
                    {money(detailBody.transaction.subtotal)} / {money(detailBody.transaction.taxAmount)} /{" "}
                    {money(detailBody.transaction.total)}
                  </dd>
                </dl>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginTop: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #ccc" }}>
                      <th style={thStyle}>Product</th>
                      <th style={thStyle}>Category</th>
                      <th style={thStyle}>Qty</th>
                      <th style={thStyle}>Unit</th>
                      <th style={thStyle}>Line total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailBody.lineItems.map((li) => (
                      <tr key={li.id} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={tdStyle}>{li.productName}</td>
                        <td style={tdStyle}>{li.category}</td>
                        <td style={tdStyle}>{li.quantity}</td>
                        <td style={tdStyle}>{money(li.unitPrice)}</td>
                        <td style={tdStyle}>{money(li.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TopTable({ rows }: { rows: TopRow[] }) {
  if (rows.length === 0) {
    return <p style={{ opacity: 0.7, fontSize: 14 }}>No sales in this period.</p>;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
            <th style={thStyle}>#</th>
            <th style={thStyle}>Product</th>
            <th style={thStyle}>Category</th>
            <th style={thStyle}>Units</th>
            <th style={thStyle}>Revenue</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.productId} style={{ borderBottom: "1px solid #eee" }}>
              <td style={tdStyle}>{i + 1}</td>
              <td style={tdStyle}>{r.name}</td>
              <td style={tdStyle}>{r.category}</td>
              <td style={tdStyle}>{r.unitsSold}</td>
              <td style={tdStyle}>{money(r.revenue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 14,
  background: "#fff",
};
const labelStyle: CSSProperties = { fontSize: 12, opacity: 0.75, marginBottom: 4 };
const valueStyle: CSSProperties = { fontSize: 22, fontWeight: 700 };
const inputStyle: CSSProperties = {
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #ccc",
};
const btnPrimary: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};
const btnSecondary: CSSProperties = {
  padding: "8px 14px",
  borderRadius: 6,
  border: "1px solid #ccc",
  background: "#fff",
  cursor: "pointer",
};
const thStyle: CSSProperties = { padding: "8px 6px", fontWeight: 600 };
const tdStyle: CSSProperties = { padding: "8px 6px", verticalAlign: "top" };
