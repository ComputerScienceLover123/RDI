"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import type { UserRole } from "@prisma/client";
import InventoryManagement from "@/components/store/InventoryManagement";
import StoreHomeDashboard from "@/components/store/StoreHomeDashboard";

type StoreOption = { id: string; name: string };

type Panel = "home" | "inventory";

export default function StoreDashboard(props: {
  storeId: string;
  storeName: string;
  userRole: UserRole;
  canAudit: boolean;
  adminStores: StoreOption[];
  canLogFuelDelivery: boolean;
  canHotCase: boolean;
  canViewLottery: boolean;
  canViewScanData: boolean;
}) {
  const {
    storeId,
    storeName,
    userRole,
    canAudit,
    adminStores,
    canLogFuelDelivery,
    canHotCase,
    canViewLottery,
    canViewScanData,
  } = props;

  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const panel: Panel = tab === "inventory" ? "inventory" : "home";

  const base = `/store/${encodeURIComponent(storeId)}`;

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

      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 4px" }}>{storeName}</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>
          Store <code>{storeId}</code>
          {panel === "home" ? " · Home" : null}
          {panel === "inventory" ? " · Inventory" : null}
        </p>
      </header>

      <nav
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          borderBottom: "1px solid #e5e5e5",
          paddingBottom: 12,
          marginBottom: 20,
        }}
        aria-label="Store modules"
      >
        <NavLink href={base} active={panel === "home"}>
          Home
        </NavLink>
        <NavLink href={`${base}?tab=inventory`} active={panel === "inventory"}>
          Inventory
        </NavLink>
        <NavLink href={`${base}/ordering`} active={false}>
          Ordering
        </NavLink>
        <NavLink href={`${base}/sales`} active={false}>
          Sales
        </NavLink>
        <NavLink href={`${base}/schedule`} active={false}>
          Schedule
        </NavLink>
        <NavLink href={`${base}/fuel`} active={false}>
          Fuel
        </NavLink>
        <NavLink href={`${base}/foodservice`} active={false}>
          Foodservice
        </NavLink>
        {canViewLottery ? (
          <NavLink href={`${base}/lottery`} active={false}>
            Lottery
          </NavLink>
        ) : null}
        {canViewScanData ? (
          <NavLink href={`${base}/scan-data`} active={false}>
            Scan data
          </NavLink>
        ) : null}
        <NavLink href={`${base}/compliance`} active={false}>
          Compliance
        </NavLink>
      </nav>

      {panel === "home" ? (
        <StoreHomeDashboard
          storeId={storeId}
          userRole={userRole}
          canLogFuelDelivery={canLogFuelDelivery}
          canHotCase={canHotCase}
          canViewLottery={canViewLottery}
        />
      ) : (
        <InventoryManagement storeId={storeId} userRole={userRole} canAudit={canAudit} />
      )}
    </div>
  );
}

function NavLink(props: { href: string; active: boolean; children: ReactNode }) {
  const { href, active, children } = props;
  return (
    <Link
      href={href}
      style={{
        padding: "8px 14px",
        borderRadius: 8,
        textDecoration: "none",
        fontWeight: active ? 700 : 500,
        fontSize: 14,
        color: active ? "#1d4ed8" : "#374151",
        background: active ? "#eff6ff" : "transparent",
        border: active ? "1px solid #bfdbfe" : "1px solid transparent",
      }}
    >
      {children}
    </Link>
  );
}
