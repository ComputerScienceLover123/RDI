"use client";

import Link from "next/link";
import { useState } from "react";
import type { UserRole } from "@prisma/client";
import InventoryManagement from "@/components/store/InventoryManagement";
import OrdersSection from "@/components/store/OrdersSection";

type StoreOption = { id: string; name: string };

export default function StoreDashboard(props: {
  storeId: string;
  storeName: string;
  userRole: UserRole;
  canAudit: boolean;
  adminStores: StoreOption[];
}) {
  const { storeId, storeName, userRole, canAudit, adminStores } = props;
  const [tab, setTab] = useState<"inventory" | "ordering">("inventory");

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
      </div>

      {tab === "inventory" ? (
        <InventoryManagement storeId={storeId} userRole={userRole} canAudit={canAudit} />
      ) : (
        <section>
          <h2 style={{ marginTop: 0 }}>Ordering</h2>
          <OrdersSection storeId={storeId} role={userRole} />
        </section>
      )}
    </div>
  );
}
