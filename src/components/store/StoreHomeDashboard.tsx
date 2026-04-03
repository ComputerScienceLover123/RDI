"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { UserRole } from "@prisma/client";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

function Skeleton({ h = 80 }: { h?: number }) {
  return (
    <div
      style={{
        height: h,
        borderRadius: 10,
        background: "linear-gradient(90deg, #f4f4f5 25%, #e4e4e7 50%, #f4f4f5 75%)",
        backgroundSize: "200% 100%",
        animation: "pulse 1.2s ease-in-out infinite",
      }}
    />
  );
}

type KpiPayload = {
  todaySalesTotal: number;
  salesPctVsSameDayLastWeek: number | null;
  todayTransactionCount: number;
  lowStockProductCount: number;
  activePurchaseOrdersSubmitted: number;
  foodserviceWasteUnitsToday: number;
  foodserviceWasteDollarsToday: number;
  unreadNotificationsCount: number;
};

export default function StoreHomeDashboard(props: {
  storeId: string;
  userRole: UserRole;
  canLogFuelDelivery: boolean;
  canHotCase: boolean;
}) {
  const { storeId, userRole, canLogFuelDelivery, canHotCase } = props;
  const router = useRouter();
  const base = `/store/${encodeURIComponent(storeId)}`;
  const api = `/api/store/${encodeURIComponent(storeId)}/home`;

  const isEmployee = userRole === "employee";

  const [kpi, setKpi] = useState<KpiPayload | null>(null);
  const [kpiLoad, setKpiLoad] = useState(!isEmployee);

  const [alerts, setAlerts] = useState<
    Array<{ id: string; title: string; description: string; severity: string; linkUrl: string; createdAt: string }>
  >([]);
  const [alertsLoad, setAlertsLoad] = useState(!isEmployee);

  const [fuel, setFuel] = useState<{ hasFuel: boolean; tanks: Array<{ id: string; grade: string; fillPct: number; urgent: boolean; tankNumber: number }> } | null>(
    null,
  );
  const [fuelLoad, setFuelLoad] = useState(!isEmployee);

  const [sched, setSched] = useState<{
    workingNow: Array<{ name: string; until: string }>;
    nextUp: { name: string; startsAt: string } | null;
    scheduledStaffCount: number;
    scheduledHoursToday: number;
  } | null>(null);
  const [schedLoad, setSchedLoad] = useState(true);

  const [hourly, setHourly] = useState<Array<{ hour: number; salesDollars: number }>>([]);
  const [hourlyLoad, setHourlyLoad] = useState(!isEmployee);

  const [activity, setActivity] = useState<
    Array<{ id: string; kind: string; title: string; detail: string; actorName: string; at: string; linkUrl: string }>
  >([]);
  const [activityLoad, setActivityLoad] = useState(!isEmployee);

  const [emp, setEmp] = useState<{
    scheduleSnapshot: {
      workingNow: Array<{ name: string; until: string }>;
      nextUp: { name: string; startsAt: string } | null;
      scheduledStaffCount: number;
      scheduledHoursToday: number;
    };
    myUpcomingShifts: Array<{ id: string; shiftDate: string; label: string; storeName: string }>;
    infoNotifications: Array<{ id: string; title: string; description: string; linkUrl: string; read: boolean; createdAt: string }>;
  } | null>(null);
  const [empLoad, setEmpLoad] = useState(isEmployee);

  const run = useCallback(
    async (path: string, setter: (d: unknown) => void, setLoading: (v: boolean) => void) => {
      setLoading(true);
      const r = await fetch(path, { credentials: "include" });
      const j = await r.json().catch(() => null);
      if (r.ok) setter(j);
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    if (isEmployee) {
      void (async () => {
        setEmpLoad(true);
        const r = await fetch(`${api}/employee`, { credentials: "include" });
        const j = await r.json().catch(() => null);
        if (r.ok) setEmp(j);
        setEmpLoad(false);
      })();
      return;
    }

    void run(`${api}/kpis`, (d) => setKpi(d as KpiPayload), setKpiLoad);
    void run(`${api}/alerts`, (d) => setAlerts((d as { alerts: typeof alerts }).alerts ?? []), setAlertsLoad);
    void run(`${api}/fuel`, (d) => setFuel(d as typeof fuel), setFuelLoad);
    void run(`${api}/schedule`, (d) => setSched(d as typeof sched), setSchedLoad);
    void run(`${api}/sales-hourly`, (d) => setHourly((d as { points: typeof hourly }).points ?? []), setHourlyLoad);
    void run(`${api}/activity`, (d) => setActivity((d as { feed: typeof activity }).feed ?? []), setActivityLoad);
  }, [api, isEmployee, run]);

  useEffect(() => {
    const id = "store-home-pulse";
    if (typeof document === "undefined") return;
    if (!document.getElementById(id)) {
      const s = document.createElement("style");
      s.id = id;
      s.textContent = `@keyframes pulse { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`;
      document.head.appendChild(s);
    }
  }, []);

  if (isEmployee) {
    return (
      <div style={{ display: "grid", gap: 20 }}>
        <section>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Today at a glance</h2>
          {empLoad || !emp ? (
            <Skeleton h={120} />
          ) : (
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>On shift now</div>
                {emp.scheduleSnapshot.workingNow.length === 0 ? (
                  <p style={{ margin: 0, opacity: 0.75 }}>No one on shift right now.</p>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {emp.scheduleSnapshot.workingNow.map((w) => (
                      <li key={w.name + w.until}>
                        {w.name} · until {w.until}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Next in</div>
                {emp.scheduleSnapshot.nextUp ? (
                  <p style={{ margin: 0 }}>
                    {emp.scheduleSnapshot.nextUp.name} at {emp.scheduleSnapshot.nextUp.startsAt}
                  </p>
                ) : (
                  <p style={{ margin: 0, opacity: 0.75 }}>No more shifts on today&apos;s schedule.</p>
                )}
              </div>
            </div>
          )}
        </section>

        <section>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Your upcoming shifts</h2>
          {empLoad || !emp ? (
            <Skeleton h={100} />
          ) : emp.myUpcomingShifts.length === 0 ? (
            <p style={{ opacity: 0.8 }}>No upcoming shifts scheduled.</p>
          ) : (
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {emp.myUpcomingShifts.map((s) => (
                <li key={s.id} style={{ marginBottom: 6 }}>
                  {s.shiftDate} · {s.label} · {s.storeName}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Notifications</h2>
          {empLoad || !emp ? (
            <Skeleton h={100} />
          ) : emp.infoNotifications.length === 0 ? (
            <p style={{ opacity: 0.8 }}>No info notifications right now.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {emp.infoNotifications.map((n) => (
                <li key={n.id} style={{ marginBottom: 10, borderBottom: "1px solid #f0f0f0", paddingBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => router.push(n.linkUrl)}
                    style={{
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "#2563eb",
                      fontWeight: 600,
                    }}
                  >
                    {n.title}
                  </button>
                  <p style={{ margin: "4px 0 0", fontSize: 14, opacity: 0.85 }}>{n.description}</p>
                  <time style={{ fontSize: 12, opacity: 0.6 }}>{new Date(n.createdAt).toLocaleString()}</time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <section>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Key metrics</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: 12,
          }}
        >
          {kpiLoad || !kpi ? (
            <>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} h={88} />
              ))}
            </>
          ) : (
            <>
              <KpiCard
                label="Sales today"
                value={`$${kpi.todaySalesTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                sub={
                  kpi.salesPctVsSameDayLastWeek == null
                    ? "vs same day last week"
                    : `${kpi.salesPctVsSameDayLastWeek >= 0 ? "+" : ""}${kpi.salesPctVsSameDayLastWeek}% vs same day last week`
                }
              />
              <KpiCard label="Transactions" value={String(kpi.todayTransactionCount)} sub="Today" />
              <KpiCard label="Low stock SKUs" value={String(kpi.lowStockProductCount)} sub="At or below min" />
              <KpiCard label="Open POs" value={String(kpi.activePurchaseOrdersSubmitted)} sub="Awaiting delivery" />
              <KpiCard
                label="Foodservice waste"
                value={`${kpi.foodserviceWasteUnitsToday} units`}
                sub={`$${kpi.foodserviceWasteDollarsToday.toFixed(2)} est. retail`}
              />
              <KpiCard label="Unread alerts" value={String(kpi.unreadNotificationsCount)} sub="In your inbox" />
            </>
          )}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Alerts</h2>
        {alertsLoad ? (
          <Skeleton h={56} />
        ) : alerts.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              borderRadius: 10,
              background: "#ecfdf5",
              border: "1px solid #6ee7b7",
              color: "#065f46",
              fontWeight: 600,
            }}
          >
            <span aria-hidden>✓</span> All clear — no warning or critical alerts for this store today.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {alerts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => router.push(a.linkUrl)}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 8,
                  border: `1px solid ${a.severity === "critical" ? "#fecaca" : "#fde68a"}`,
                  background: a.severity === "critical" ? "#fef2f2" : "#fffbeb",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700 }}>{a.title}</div>
                <div style={{ fontSize: 14, opacity: 0.85 }}>{a.description}</div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Fuel</h2>
        {fuelLoad ? (
          <Skeleton h={64} />
        ) : !fuel?.hasFuel ? (
          <p style={{ opacity: 0.75, margin: 0 }}>No fuel tanks configured for this store.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {fuel.tanks.map((t) => (
              <Link
                key={t.id}
                href={`${base}/fuel`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  minWidth: 140,
                  padding: 12,
                  borderRadius: 10,
                  border: `2px solid ${t.urgent ? "#dc2626" : "#e5e7eb"}`,
                  background: t.urgent ? "#fef2f2" : "#fafafa",
                }}
              >
                <div style={{ fontSize: 12, textTransform: "capitalize", opacity: 0.8 }}>Tank {t.tankNumber} · {t.grade}</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{t.fillPct}%</div>
                <div style={{ marginTop: 8, height: 8, borderRadius: 4, background: "#e5e7eb" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, t.fillPct)}%`,
                      borderRadius: 4,
                      background: t.urgent ? "#dc2626" : "#2563eb",
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Quick actions</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <ActionLink href={`${base}?tab=inventory`} label="Start inventory audit" />
          <ActionLink href={`${base}/ordering/new`} label="Create purchase order" />
          {canLogFuelDelivery ? <ActionLink href={`${base}/fuel`} label="Log fuel delivery" /> : null}
          {canHotCase ? <ActionLink href={`${base}/foodservice`} label="Place items in hot case" /> : null}
          <ActionLink href={`${base}/schedule`} label="View today’s schedule" />
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Schedule snapshot</h2>
        {schedLoad || !sched ? (
          <Skeleton h={100} />
        ) : (
          <Link href={`${base}/schedule`} style={{ textDecoration: "none", color: "inherit" }}>
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 14,
                display: "grid",
                gap: 10,
                gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Working now</div>
                {sched.workingNow.length === 0 ? (
                  <span style={{ opacity: 0.75 }}>—</span>
                ) : (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {sched.workingNow.map((w) => (
                      <li key={w.name}>
                        {w.name} (until {w.until})
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Next in</div>
                {sched.nextUp ? (
                  <span>
                    {sched.nextUp.name} · {sched.nextUp.startsAt}
                  </span>
                ) : (
                  <span style={{ opacity: 0.75 }}>—</span>
                )}
              </div>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Staffing today</div>
                <span>
                  {sched.scheduledStaffCount} people · {sched.scheduledHoursToday}h scheduled
                </span>
              </div>
            </div>
          </Link>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Sales by hour (today)</h2>
        {hourlyLoad ? (
          <Skeleton h={140} />
        ) : (
          <Link href={`${base}/sales`} style={{ display: "block", textDecoration: "none", color: "inherit" }}>
            <div style={{ width: "100%", height: 160, border: "1px solid #eee", borderRadius: 10, padding: 8 }}>
              <ResponsiveContainer>
                <LineChart data={hourly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={(h) => `${h}h`} />
                  <YAxis tick={{ fontSize: 10 }} width={44} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v) => [`$${v == null ? "—" : Number(v).toFixed(2)}`, "Sales"]} />
                  <Line type="monotone" dataKey="salesDollars" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Link>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>Recent activity</h2>
        {activityLoad ? (
          <Skeleton h={200} />
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {activity.map((a) => (
              <li
                key={a.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: "1px solid #f0f0f0",
                }}
              >
                <div>
                  <button
                    type="button"
                    onClick={() => router.push(a.linkUrl)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      fontWeight: 600,
                      color: "#111",
                      textAlign: "left",
                    }}
                  >
                    {a.title}
                  </button>
                  <div style={{ fontSize: 14, opacity: 0.8 }}>{a.detail}</div>
                  <div style={{ fontSize: 13, opacity: 0.65 }}>
                    {a.actorName} · {new Date(a.at).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, background: "#fafafa" }}>
      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 11, opacity: 0.65, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-block",
        padding: "10px 16px",
        borderRadius: 8,
        background: "#f4f4f5",
        border: "1px solid #e5e7eb",
        fontWeight: 600,
        fontSize: 14,
        textDecoration: "none",
        color: "#111",
      }}
    >
      {label}
    </Link>
  );
}
