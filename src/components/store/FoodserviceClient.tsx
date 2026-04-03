"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

type FsTab = "overview" | "hotcase" | "waste" | "recipes" | "production";

type HotEntry = {
  id: string;
  menuItemId: string;
  itemName: string;
  holdTimeMinutes: number;
  quantityPlaced: number;
  placedAt: string;
  expiresAt: string;
  remainingSeconds: number;
  urgency: string;
  needsDisposition: boolean;
};

type DashboardPayload = {
  hatchEnabled: boolean;
  menuItems: Array<{
    id: string;
    itemName: string;
    category: string;
    brand: string;
    holdTimeMinutes: number;
    prepTimeMinutes: number;
    retailPrice: string;
    recipeId: string | null;
    recipeName: string | null;
  }>;
  hotCase: HotEntry[];
  wasteToday: { itemCount: number; estimatedDollars: number };
  suggestions: Array<{
    menuItemId: string;
    itemName: string;
    category: string;
    sameDayLastWeek: number;
    avgFourWeekSameWeekday: number;
    suggestedPrep: number;
  }>;
  canManageProduction: boolean;
};

const CAT_LABEL: Record<string, string> = {
  roller_grill: "Roller grill",
  pizza: "Pizza",
  chicken: "Chicken",
  sides: "Sides",
  taquitos: "Taquitos",
  tacos: "Tacos",
  beverages: "Beverages",
  other: "Other",
};

const WASTE_REASONS: { value: string; label: string }[] = [
  { value: "expired_hold", label: "Expired hold time" },
  { value: "dropped", label: "Dropped" },
  { value: "overproduction", label: "Overproduction" },
  { value: "quality_issue", label: "Quality issue" },
  { value: "other", label: "Other" },
];

function formatClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function urgencyFromRemaining(remainingMs: number, holdMs: number): "green" | "yellow" | "red" | "expired" {
  if (remainingMs <= 0) return "expired";
  if (remainingMs <= 10 * 60 * 1000) return "red";
  if (remainingMs <= holdMs / 2) return "yellow";
  return "green";
}

function urgencyColor(u: string): string {
  if (u === "green") return "#16a34a";
  if (u === "yellow") return "#ca8a04";
  if (u === "red") return "#dc2626";
  return "#6b7280";
}

export default function FoodserviceClient(props: {
  storeId: string;
  storeName: string;
  userRole: UserRole;
  adminStores: StoreOption[];
}) {
  const { storeId, storeName, userRole, adminStores } = props;
  const isManager = userRole === "manager" || userRole === "admin";
  const [tab, setTab] = useState<FsTab>("overview");

  const [dash, setDash] = useState<DashboardPayload | null>(null);
  const [hotEntries, setHotEntries] = useState<HotEntry[]>([]);
  const [recipes, setRecipes] = useState<Array<{ id: string; name: string; brand: string; category: string }>>([]);
  const [recipeDetail, setRecipeDetail] = useState<{
    recipe: Record<string, unknown>;
    ingredients: Array<Record<string, unknown>>;
  } | null>(null);
  const [production, setProduction] = useState<{
    plan: {
      id: string;
      planDate: string;
      status: string;
      lines: Array<{
        id: string;
        menuItemId: string;
        itemName: string;
        quantitySuggested: number;
        quantityFinal: number;
      }>;
    };
  } | null>(null);
  const [planDate, setPlanDate] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });
  const [trend, setTrend] = useState<Array<{ date: string; wastePct: number | null; wasteUnits: number }>>([]);
  const [wasteRows, setWasteRows] = useState<
    Array<{
      id: string;
      createdAt: string;
      itemName: string;
      quantity: number;
      reason: string;
      estimatedValue: number;
      loggedByName: string;
    }>
  >([]);

  const [wFrom, setWFrom] = useState("");
  const [wTo, setWTo] = useState("");
  const [wReason, setWReason] = useState("");
  const [wQ, setWQ] = useState("");

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const [placeMenuId, setPlaceMenuId] = useState("");
  const [placeQty, setPlaceQty] = useState("1");

  const [wasteMenuId, setWasteMenuId] = useState("");
  const [wasteQty, setWasteQty] = useState("1");
  const [wasteReason, setWasteReason] = useState("other");

  const [confirmShort, setConfirmShort] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }, []);

  const base = `/api/store/${encodeURIComponent(storeId)}/foodservice`;

  const loadDashboard = useCallback(async () => {
    const r = await fetch(`${base}/dashboard`, { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error ?? "Failed to load dashboard");
    setDash({
      hatchEnabled: j.hatchEnabled,
      menuItems: j.menuItems ?? [],
      hotCase: j.hotCase ?? [],
      wasteToday: j.wasteToday ?? { itemCount: 0, estimatedDollars: 0 },
      suggestions: j.suggestions ?? [],
      canManageProduction: !!j.canManageProduction,
    });
    setHotEntries(j.hotCase ?? []);
    setPlaceMenuId((prev) => prev || j.menuItems?.[0]?.id || "");
    setWasteMenuId((prev) => prev || j.menuItems?.[0]?.id || "");
  }, [base]);

  const loadHotOnly = useCallback(async () => {
    const r = await fetch(`${base}/hot-case`, { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (!r.ok) return;
    setHotEntries(j.entries ?? []);
  }, [base]);

  const loadRecipes = useCallback(async () => {
    if (!isManager) return;
    const r = await fetch(`${base}/recipes`, { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Could not load recipes");
      return;
    }
    setRecipes(j.recipes ?? []);
  }, [base, isManager, showToast]);

  const loadProduction = useCallback(async () => {
    if (!isManager) return;
    const r = await fetch(`${base}/production?date=${encodeURIComponent(planDate)}`, { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Could not load production plan");
      return;
    }
    setProduction(j);
  }, [base, isManager, planDate, showToast]);

  const loadTrend = useCallback(async () => {
    const r = await fetch(`${base}/waste/trend`, { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (r.ok) setTrend(j.points ?? []);
  }, [base]);

  const loadWaste = useCallback(async () => {
    const sp = new URLSearchParams();
    if (wFrom) sp.set("from", wFrom);
    if (wTo) sp.set("to", wTo);
    if (wReason) sp.set("reason", wReason);
    if (wQ.trim()) sp.set("q", wQ.trim());
    const r = await fetch(`${base}/waste?${sp.toString()}`, { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (r.ok) setWasteRows(j.waste ?? []);
  }, [base, wFrom, wTo, wReason, wQ]);

  const initialLoad = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      await loadDashboard();
      await loadTrend();
      await loadWaste();
      if (isManager) {
        await loadRecipes();
        await loadProduction();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [isManager, loadDashboard, loadProduction, loadRecipes, loadTrend, loadWaste]);

  useEffect(() => {
    void initialLoad();
  }, [initialLoad]);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (tab === "hotcase" || tab === "overview") {
      const iv = setInterval(() => void loadHotOnly(), 8000);
      return () => clearInterval(iv);
    }
  }, [tab, loadHotOnly]);

  useEffect(() => {
    if (tab === "waste") void loadWaste();
  }, [tab, loadWaste]);

  useEffect(() => {
    if (tab === "production" && isManager) void loadProduction();
  }, [tab, isManager, loadProduction]);

  const liveHot = useMemo(() => {
    const now = Date.now();
    return hotEntries.map((h) => {
      const holdMs = h.holdTimeMinutes * 60 * 1000;
      const remainingMs = new Date(h.expiresAt).getTime() - now;
      const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
      const u = urgencyFromRemaining(remainingMs, holdMs);
      return {
        ...h,
        remainingSeconds,
        urgency: u,
        needsDisposition: remainingMs <= 0,
      };
    });
  }, [hotEntries, tick]);

  const firstExpired = useMemo(() => liveHot.find((h) => h.needsDisposition) ?? null, [liveHot]);

  async function placeItem() {
    const qty = Number(placeQty);
    if (!placeMenuId || !Number.isFinite(qty) || qty < 1) {
      showToast("Select a menu item and quantity");
      return;
    }
    const r = await fetch(`${base}/hot-case`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ menuItemId: placeMenuId, quantity: qty }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Could not place item");
      return;
    }
    showToast("Added to hot case");
    setPlaceQty("1");
    await loadDashboard();
    await loadHotOnly();
  }

  async function dispose(entryId: string, disposition: "sold" | "wasted") {
    const r = await fetch(`${base}/hot-case/${encodeURIComponent(entryId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ disposition }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Could not update");
      return;
    }
    showToast(disposition === "sold" ? "Marked sold" : "Logged as waste");
    await loadDashboard();
    await loadHotOnly();
    await loadWaste();
    await loadTrend();
  }

  async function logWasteManual() {
    const qty = Number(wasteQty);
    if (!wasteMenuId || !Number.isFinite(qty) || qty < 1) {
      showToast("Select item and quantity");
      return;
    }
    const r = await fetch(`${base}/waste`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ menuItemId: wasteMenuId, quantity: qty, reason: wasteReason }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Could not log waste");
      return;
    }
    showToast("Waste logged");
    await loadDashboard();
    await loadWaste();
    await loadTrend();
  }

  async function openRecipe(id: string) {
    const r = await fetch(`${base}/recipes/${encodeURIComponent(id)}`, { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Could not load recipe");
      return;
    }
    setRecipeDetail({ recipe: j.recipe, ingredients: j.ingredients ?? [] });
  }

  async function saveProductionLines() {
    if (!production?.plan || production.plan.status !== "draft") {
      showToast("Nothing to save");
      return;
    }
    const lines = production.plan.lines.map((l) => ({
      menuItemId: l.menuItemId,
      quantityFinal: l.quantityFinal,
    }));
    const r = await fetch(`${base}/production`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ planDate: production.plan.planDate, lines }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Save failed");
      return;
    }
    showToast("Saved quantities");
    await loadProduction();
  }

  async function confirmProduction() {
    if (!production?.plan) return;
    const r = await fetch(`${base}/production/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ planDate: production.plan.planDate }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Confirm failed");
      return;
    }
    if (j.shortages?.length) {
      setConfirmShort(
        `Short ingredients: ${j.shortages.map((s: { productName: string }) => s.productName).join(", ")}`,
      );
    } else {
      setConfirmShort(null);
    }
    showToast(j.warning ?? "Plan confirmed");
    await loadProduction();
  }

  function updateLineQty(menuItemId: string, qty: number) {
    setProduction((prev) => {
      if (!prev?.plan) return prev;
      return {
        plan: {
          ...prev.plan,
          lines: prev.plan.lines.map((l) =>
            l.menuItemId === menuItemId ? { ...l, quantityFinal: Math.max(0, qty) } : l,
          ),
        },
      };
    });
  }

  const menuItems = dash?.menuItems ?? [];
  const wasteToday = dash?.wasteToday ?? { itemCount: 0, estimatedDollars: 0 };

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
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
            fontSize: 14,
          }}
        >
          {toast}
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 8 }}>
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
                if (id !== storeId) window.location.href = `/store/${encodeURIComponent(id)}/foodservice`;
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

      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 4px" }}>Foodservice — {storeName}</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>
          Hot case, waste, recipes, and production{dash?.hatchEnabled ? " · Hatch location" : ""}
        </p>
      </header>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderBottom: "1px solid #e5e5e5", marginBottom: 20 }}>
        {(
          [
            ["overview", "Overview"],
            ["hotcase", "Hot case"],
            ["waste", "Waste"],
            ...(isManager ? [["recipes", "Recipes"] as const] : []),
            ...(isManager ? [["production", "Production"] as const] : []),
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k as FsTab)}
            style={{
              padding: "10px 14px",
              border: "none",
              background: tab === k ? "#f4f4f5" : "transparent",
              borderBottom: tab === k ? "2px solid #2563eb" : "2px solid transparent",
              cursor: "pointer",
              fontWeight: tab === k ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? <p style={{ opacity: 0.8 }}>Loading…</p> : null}
      {err ? (
        <p style={{ color: "#b91c1c" }}>
          {err}{" "}
          <button type="button" onClick={() => void initialLoad()} style={{ marginLeft: 8 }}>
            Retry
          </button>
        </p>
      ) : null}

      {!loading && !err && tab === "overview" && dash ? (
        <section>
          <h2 style={{ marginTop: 0 }}>Hot case now</h2>
          {liveHot.length === 0 ? (
            <p style={{ opacity: 0.8 }}>Nothing in the hot case.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {liveHot.map((h) => (
                <div
                  key={h.id}
                  style={{
                    border: `1px solid ${urgencyColor(h.urgency)}`,
                    borderRadius: 10,
                    padding: 12,
                    background: "#fafafa",
                  }}
                >
                  <div style={{ fontWeight: 700 }}>{h.itemName}</div>
                  <div style={{ fontSize: 13, opacity: 0.8 }}>Qty {h.quantityPlaced}</div>
                  <div style={{ fontSize: 22, fontVariantNumeric: "tabular-nums", marginTop: 8 }}>
                    {h.urgency === "expired" ? "Expired" : formatClock(h.remainingSeconds)}
                  </div>
                </div>
              ))}
            </div>
          )}

          <h3 style={{ marginTop: 28 }}>Waste today</h3>
          <p style={{ marginTop: 0 }}>
            <strong>{wasteToday.itemCount}</strong> units · ~<strong>${wasteToday.estimatedDollars.toFixed(2)}</strong>{" "}
            retail value
          </p>

          {isManager ? (
            <>
              <h3 style={{ marginTop: 24 }}>Production suggestions (same day last week vs 4-week avg)</h3>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                      <th style={{ padding: "8px 6px" }}>Item</th>
                      <th style={{ padding: "8px 6px" }}>Last week</th>
                      <th style={{ padding: "8px 6px" }}>4-wk avg</th>
                      <th style={{ padding: "8px 6px" }}>Suggested prep</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dash.suggestions.map((s) => (
                      <tr key={s.menuItemId} style={{ borderBottom: "1px solid #f5f5f5" }}>
                        <td style={{ padding: "8px 6px" }}>{s.itemName}</td>
                        <td style={{ padding: "8px 6px" }}>{s.sameDayLastWeek}</td>
                        <td style={{ padding: "8px 6px" }}>{s.avgFourWeekSameWeekday}</td>
                        <td style={{ padding: "8px 6px" }}>{s.suggestedPrep}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p style={{ opacity: 0.75, marginTop: 16 }}>Managers see suggested prep quantities here.</p>
          )}
        </section>
      ) : null}

      {!loading && !err && tab === "hotcase" && dash ? (
        <section>
          <h2 style={{ marginTop: 0 }}>Log items into hot case</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 24 }}>
            <label>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Menu item</div>
              <select
                value={placeMenuId}
                onChange={(e) => setPlaceMenuId(e.target.value)}
                style={{ padding: 8, minWidth: 220, borderRadius: 6, border: "1px solid #ccc" }}
              >
                {menuItems.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.itemName} ({CAT_LABEL[m.category] ?? m.category})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <div style={{ fontSize: 13, marginBottom: 4 }}>Quantity</div>
              <input
                value={placeQty}
                onChange={(e) => setPlaceQty(e.target.value)}
                style={{ padding: 8, width: 80, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </label>
            <button
              type="button"
              onClick={() => void placeItem()}
              style={{
                padding: "10px 18px",
                background: "#2563eb",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Add to hot case
            </button>
          </div>

          <h3>Active batches</h3>
          {liveHot.length === 0 ? (
            <p style={{ opacity: 0.8 }}>No active batches.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {liveHot.map((h) => (
                <li
                  key={h.id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 0",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <strong>{h.itemName}</strong> × {h.quantityPlaced}
                    <div style={{ fontSize: 13, color: urgencyColor(h.urgency) }}>
                      {h.urgency === "expired" ? "Expired — clear or log waste" : `${formatClock(h.remainingSeconds)} left`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void dispose(h.id, "sold")}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #16a34a", background: "#fff" }}
                  >
                    Sold
                  </button>
                  <button
                    type="button"
                    onClick={() => void dispose(h.id, "wasted")}
                    style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #dc2626", background: "#fff" }}
                  >
                    Waste
                  </button>
                </li>
              ))}
            </ul>
          )}

          {firstExpired ? (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 150,
                padding: 16,
              }}
            >
              <div
                style={{
                  background: "#fff",
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 400,
                  width: "100%",
                  boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
                }}
              >
                <h3 style={{ marginTop: 0 }}>Hold time expired</h3>
                <p style={{ marginBottom: 16 }}>
                  <strong>{firstExpired.itemName}</strong> (×{firstExpired.quantityPlaced}) — confirm sold or waste.
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => void dispose(firstExpired.id, "sold")}
                    style={{
                      flex: 1,
                      padding: "12px",
                      background: "#16a34a",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Sold
                  </button>
                  <button
                    type="button"
                    onClick={() => void dispose(firstExpired.id, "wasted")}
                    style={{
                      flex: 1,
                      padding: "12px",
                      background: "#dc2626",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Waste
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {!loading && !err && tab === "waste" && dash ? (
        <section>
          <h2 style={{ marginTop: 0 }}>Waste tracking</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <label>
              <div style={{ fontSize: 12, opacity: 0.8 }}>From</div>
              <input
                type="date"
                value={wFrom}
                onChange={(e) => setWFrom(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, opacity: 0.8 }}>To</div>
              <input
                type="date"
                value={wTo}
                onChange={(e) => setWTo(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Reason</div>
              <select
                value={wReason}
                onChange={(e) => setWReason(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc", minWidth: 160 }}
              >
                <option value="">Any</option>
                {WASTE_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Search</div>
              <input
                value={wQ}
                onChange={(e) => setWQ(e.target.value)}
                placeholder="Item or employee name"
                style={{ padding: 8, width: "100%", borderRadius: 6, border: "1px solid #ccc" }}
              />
            </label>
            <button
              type="button"
              onClick={() => void loadWaste()}
              style={{ alignSelf: "flex-end", padding: "8px 14px", borderRadius: 6, border: "1px solid #ccc" }}
            >
              Apply
            </button>
          </div>

          <h3>Log waste (manual)</h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end", marginBottom: 28 }}>
            <select
              value={wasteMenuId}
              onChange={(e) => setWasteMenuId(e.target.value)}
              style={{ padding: 8, minWidth: 220, borderRadius: 6, border: "1px solid #ccc" }}
            >
              {menuItems.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.itemName}
                </option>
              ))}
            </select>
            <input
              value={wasteQty}
              onChange={(e) => setWasteQty(e.target.value)}
              style={{ padding: 8, width: 72, borderRadius: 6, border: "1px solid #ccc" }}
            />
            <select
              value={wasteReason}
              onChange={(e) => setWasteReason(e.target.value)}
              style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
            >
              {WASTE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void logWasteManual()}
              style={{
                padding: "10px 16px",
                background: "#111",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Log waste
            </button>
          </div>

          <h3>30-day waste % trend</h3>
          <p style={{ fontSize: 14, opacity: 0.85, marginTop: 0 }}>
            Waste as a percentage of hot-case throughput (waste + sold) per day.
          </p>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={6} />
                <YAxis tick={{ fontSize: 11 }} domain={[0, "auto"]} tickFormatter={(v) => `${v}%`} />
                <Tooltip formatter={(v) => [`${v == null ? "—" : `${v}%`}`, "Waste %"]} />
                <Line type="monotone" dataKey="wastePct" stroke="#dc2626" dot={false} strokeWidth={2} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <h3>Log</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                  <th style={{ padding: "8px 6px" }}>Time</th>
                  <th style={{ padding: "8px 6px" }}>Item</th>
                  <th style={{ padding: "8px 6px" }}>Qty</th>
                  <th style={{ padding: "8px 6px" }}>Reason</th>
                  <th style={{ padding: "8px 6px" }}>Est. $</th>
                  <th style={{ padding: "8px 6px" }}>By</th>
                </tr>
              </thead>
              <tbody>
                {wasteRows.map((w) => (
                  <tr key={w.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: "8px 6px", whiteSpace: "nowrap" }}>
                      {new Date(w.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: "8px 6px" }}>{w.itemName}</td>
                    <td style={{ padding: "8px 6px" }}>{w.quantity}</td>
                    <td style={{ padding: "8px 6px" }}>{w.reason}</td>
                    <td style={{ padding: "8px 6px" }}>${w.estimatedValue.toFixed(2)}</td>
                    <td style={{ padding: "8px 6px" }}>{w.loggedByName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {!loading && !err && tab === "recipes" && isManager ? (
        <section>
          <h2 style={{ marginTop: 0 }}>Recipes</h2>
          {!recipeDetail ? (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {recipes.map((r) => (
                <li key={r.id} style={{ marginBottom: 8 }}>
                  <button
                    type="button"
                    onClick={() => void openRecipe(r.id)}
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      border: "1px solid #e5e5e5",
                      borderRadius: 8,
                      background: "#fafafa",
                      width: "100%",
                      cursor: "pointer",
                    }}
                  >
                    <strong>{r.name}</strong>
                    <span style={{ opacity: 0.75, marginLeft: 8 }}>
                      {r.brand === "hatch" ? "Hatch" : "Store"} · {CAT_LABEL[r.category] ?? r.category}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div>
              <button type="button" onClick={() => setRecipeDetail(null)} style={{ marginBottom: 12 }}>
                ← Back to list
              </button>
              <h3 style={{ marginTop: 0 }}>{String(recipeDetail.recipe.name)}</h3>
              <p style={{ opacity: 0.85, whiteSpace: "pre-wrap" }}>{String(recipeDetail.recipe.instructions ?? "")}</p>
              <p style={{ fontSize: 14 }}>
                Prep {String(recipeDetail.recipe.prepTimeMinutes)} min · Cook {String(recipeDetail.recipe.cookTimeMinutes)}{" "}
                min
                {recipeDetail.recipe.cookTemperature ? ` · ${String(recipeDetail.recipe.cookTemperature)}` : ""} · Yield{" "}
                {String(recipeDetail.recipe.yieldQuantity)} servings
              </p>
              <h4>Ingredients (this store)</h4>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                    <th style={{ padding: 8 }}>Product</th>
                    <th style={{ padding: 8 }}>Per batch</th>
                    <th style={{ padding: 8 }}>On hand</th>
                    <th style={{ padding: 8 }}>Min</th>
                    <th style={{ padding: 8 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recipeDetail.ingredients.map((ing) => (
                    <tr key={String(ing.productId)} style={{ borderBottom: "1px solid #f5f5f5" }}>
                      <td style={{ padding: 8 }}>{String(ing.productName)}</td>
                      <td style={{ padding: 8 }}>
                        {String(ing.quantityPerBatch)} {String(ing.unitOfMeasure)}
                      </td>
                      <td style={{ padding: 8 }}>{String(ing.quantityOnHand)}</td>
                      <td style={{ padding: 8 }}>{String(ing.minStockThreshold)}</td>
                      <td style={{ padding: 8 }}>
                        {ing.lowOrOut ? (
                          <span style={{ color: "#b45309", fontWeight: 600 }}>Low / short</span>
                        ) : (
                          <span style={{ color: "#16a34a" }}>OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {!loading && !err && tab === "production" && isManager && production?.plan ? (
        <section>
          <h2 style={{ marginTop: 0 }}>Production planning</h2>
          <p style={{ opacity: 0.85, maxWidth: 640 }}>
            Suggested quantities use the same weekday over the past 4 weeks. Adjust final counts and confirm; the system
            checks ingredient inventory and reports shortages.
          </p>
          <label style={{ display: "inline-block", marginBottom: 16 }}>
            Plan date{" "}
            <input
              type="date"
              value={planDate}
              onChange={(e) => setPlanDate(e.target.value)}
              style={{ marginLeft: 8, padding: 6, borderRadius: 6, border: "1px solid #ccc" }}
            />
            <button
              type="button"
              onClick={() => void loadProduction()}
              style={{ marginLeft: 8, padding: "6px 12px", borderRadius: 6, border: "1px solid #ccc" }}
            >
              Load
            </button>
          </label>
          <p style={{ fontSize: 14 }}>
            Status: <strong>{production.plan.status}</strong>
            {production.plan.status === "confirmed" ? " — edit by picking a new draft date or contact admin." : null}
          </p>
          {confirmShort ? (
            <p style={{ color: "#b45309", fontWeight: 600 }}>{confirmShort}</p>
          ) : null}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                  <th style={{ padding: 8 }}>Item</th>
                  <th style={{ padding: 8 }}>Suggested</th>
                  <th style={{ padding: 8 }}>Final</th>
                </tr>
              </thead>
              <tbody>
                {production.plan.lines.map((l) => (
                  <tr key={l.menuItemId} style={{ borderBottom: "1px solid #f5f5f5" }}>
                    <td style={{ padding: 8 }}>{l.itemName}</td>
                    <td style={{ padding: 8 }}>{l.quantitySuggested}</td>
                    <td style={{ padding: 8 }}>
                      <input
                        type="number"
                        min={0}
                        value={l.quantityFinal}
                        disabled={production.plan.status !== "draft"}
                        onChange={(e) => updateLineQty(l.menuItemId, Number(e.target.value))}
                        style={{ width: 80, padding: 6, borderRadius: 6, border: "1px solid #ccc" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
            <button
              type="button"
              disabled={production.plan.status !== "draft"}
              onClick={() => void saveProductionLines()}
              style={{
                padding: "12px 20px",
                background: production.plan.status === "draft" ? "#2563eb" : "#9ca3af",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                cursor: production.plan.status === "draft" ? "pointer" : "not-allowed",
              }}
            >
              Save quantities
            </button>
            <button
              type="button"
              disabled={production.plan.status !== "draft"}
              onClick={() => void confirmProduction()}
              style={{
                padding: "12px 20px",
                background: production.plan.status === "draft" ? "#111" : "#9ca3af",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                cursor: production.plan.status === "draft" ? "pointer" : "not-allowed",
              }}
            >
              Confirm plan
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
