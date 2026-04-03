"use client";

import Link from "next/link";
import { useState } from "react";
import type { UserRole } from "@prisma/client";
import InventoryManagement from "@/components/store/InventoryManagement";

type StoreOption = { id: string; name: string };

export default function StoreDashboard(props: {
  storeId: string;
  storeName: string;
  userRole: UserRole;
  canAudit: boolean;
  adminStores: StoreOption[];
}) {
  const { storeId, storeName, userRole, canAudit, adminStores } = props;
  const [tab, setTab] = useState<"inventory" | "ordering" | "sales" | "schedule" | "fuel" | "foodservice">(
    "inventory",
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 8 }}>
        <Link href="/store" style={{ textDecoration: "none", color: "#2563eb" }}>
          ← Stores
        </Link>
        {userRole === "admin" && adminStores.length > 1 ? (
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
            <span style={{ fontSize: 14, opacity: 0.85 }}>Store</span>
            <select
              value={storeId}
              onChange={(e) => {
                const id = e.target.value;
                if (id !== storeId) window.location.href = `/store/${encodeURIComponent(id)}`;
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
        <h1 style={{ margin: "0 0 4px" }}>{storeName}</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>
          Store <code>{storeId}</code> · Role <code>{userRole}</code>
        </p>
      </header>

      <div style={{ display: "flex", gap: 8, borderBottom: "1px solid #e5e5e5", marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setTab("inventory")}
          style={{
            padding: "10px 16px",
            border: "none",
            background: tab === "inventory" ? "#f4f4f5" : "transparent",
            borderBottom: tab === "inventory" ? "2px solid #2563eb" : "2px solid transparent",
            cursor: "pointer",
            fontWeight: tab === "inventory" ? 600 : 400,
          }}
        >
          Inventory
        </button>
        <button
          type="button"
          onClick={() => setTab("ordering")}
          style={{
            padding: "10px 16px",
            border: "none",
            background: tab === "ordering" ? "#f4f4f5" : "transparent",
            borderBottom: tab === "ordering" ? "2px solid #2563eb" : "2px solid transparent",
            cursor: "pointer",
            fontWeight: tab === "ordering" ? 600 : 400,
          }}
        >
          Ordering
        </button>
        <button
          type="button"
          onClick={() => setTab("sales")}
          style={{
            padding: "10px 16px",
            border: "none",
            background: tab === "sales" ? "#f4f4f5" : "transparent",
            borderBottom: tab === "sales" ? "2px solid #2563eb" : "2px solid transparent",
            cursor: "pointer",
            fontWeight: tab === "sales" ? 600 : 400,
          }}
        >
          Sales
        </button>
        <button
          type="button"
          onClick={() => setTab("schedule")}
          style={{
            padding: "10px 16px",
            border: "none",
            background: tab === "schedule" ? "#f4f4f5" : "transparent",
            borderBottom: tab === "schedule" ? "2px solid #2563eb" : "2px solid transparent",
            cursor: "pointer",
            fontWeight: tab === "schedule" ? 600 : 400,
          }}
        >
          Schedule
        </button>
        <button
          type="button"
          onClick={() => setTab("fuel")}
          style={{
            padding: "10px 16px",
            border: "none",
            background: tab === "fuel" ? "#f4f4f5" : "transparent",
            borderBottom: tab === "fuel" ? "2px solid #2563eb" : "2px solid transparent",
            cursor: "pointer",
            fontWeight: tab === "fuel" ? 600 : 400,
          }}
        >
          Fuel
        </button>
        <button
          type="button"
          onClick={() => setTab("foodservice")}
          style={{
            padding: "10px 16px",
            border: "none",
            background: tab === "foodservice" ? "#f4f4f5" : "transparent",
            borderBottom: tab === "foodservice" ? "2px solid #2563eb" : "2px solid transparent",
            cursor: "pointer",
            fontWeight: tab === "foodservice" ? 600 : 400,
          }}
        >
          Foodservice
        </button>
      </div>

      {tab === "inventory" ? (
        <InventoryManagement storeId={storeId} userRole={userRole} canAudit={canAudit} />
      ) : tab === "ordering" ? (
        <section>
          <h2 style={{ marginTop: 0 }}>Ordering &amp; receiving</h2>
          <p style={{ opacity: 0.85, maxWidth: 560 }}>
            Purchase orders: create vendor orders, quick-reorder low stock, track status, and receive deliveries into
            inventory.
          </p>
          <Link
            href={`/store/${encodeURIComponent(storeId)}/ordering`}
            style={{
              display: "inline-block",
              marginTop: 12,
              padding: "12px 20px",
              background: "#2563eb",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Open purchase orders
          </Link>
        </section>
      ) : tab === "schedule" ? (
        <section>
          <h2 style={{ marginTop: 0 }}>Employee schedule</h2>
          <p style={{ opacity: 0.85, maxWidth: 560 }}>
            Weekly grid, day timeline, shift templates, and copy from last week. Managers and admins can edit;
            employees see the store schedule read-only.
          </p>
          <Link
            href={`/store/${encodeURIComponent(storeId)}/schedule`}
            style={{
              display: "inline-block",
              marginTop: 12,
              padding: "12px 20px",
              background: "#2563eb",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Open schedule
          </Link>
        </section>
      ) : tab === "fuel" ? (
        <section>
          <h2 style={{ marginTop: 0 }}>Fuel management</h2>
          <p style={{ opacity: 0.85, maxWidth: 560 }}>
            Tank gauges, delivery log, retail price updates, and estimated daily gallons sold. Managers log deliveries
            and change prices; employees can view levels only. Admins also have a multi-store overview under Admin.
          </p>
          <Link
            href={`/store/${encodeURIComponent(storeId)}/fuel`}
            style={{
              display: "inline-block",
              marginTop: 12,
              padding: "12px 20px",
              background: "#2563eb",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Open fuel dashboard
          </Link>
        </section>
      ) : tab === "foodservice" ? (
        <section>
          <h2 style={{ marginTop: 0 }}>Foodservice</h2>
          <p style={{ opacity: 0.85, maxWidth: 560 }}>
            Hot case timers, waste logging, recipes, production planning, and Hatch items (where enabled). Employees run
            the hot case; managers plan production; admins configure menus and Hatch locations under Admin →
            Foodservice.
          </p>
          <Link
            href={`/store/${encodeURIComponent(storeId)}/foodservice`}
            style={{
              display: "inline-block",
              marginTop: 12,
              padding: "12px 20px",
              background: "#2563eb",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Open foodservice module
          </Link>
        </section>
      ) : (
        <section>
          <h2 style={{ marginTop: 0 }}>Sales &amp; reporting</h2>
          <p style={{ opacity: 0.85, maxWidth: 560 }}>
            Dashboards, trends, category mix, hourly volume, and transaction log with filters. Managers and admins can
            open line-item detail and export CSV; employees see summary views only.
          </p>
          <Link
            href={`/store/${encodeURIComponent(storeId)}/sales`}
            style={{
              display: "inline-block",
              marginTop: 12,
              padding: "12px 20px",
              background: "#2563eb",
              color: "#fff",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Open sales dashboard
          </Link>
        </section>
      )}
    </div>
  );
}
