"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export type HeaderUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  assignedStoreId: string | null;
};

type NotifRow = {
  id: string;
  title: string;
  description: string;
  severity: string;
  category: string;
  linkUrl: string;
  read: boolean;
  createdAt: string;
};

function severityColor(s: string) {
  if (s === "critical") return "#b91c1c";
  if (s === "warning") return "#b45309";
  return "#2563eb";
}

function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ notifications: NotifRow[]; unreadCount: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    void fetch("/api/notifications?limit=40", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.notifications) setData({ notifications: j.notifications, unreadCount: j.unreadCount ?? 0 });
      });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!open) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const unread = data?.unreadCount ?? 0;

  async function markAllRead() {
    await fetch("/api/notifications/mark-all-read", { method: "POST", credentials: "include" });
    load();
  }

  async function onItemClick(n: NotifRow) {
    if (!n.read) {
      await fetch(`/api/notifications/${encodeURIComponent(n.id)}/read`, {
        method: "PATCH",
        credentials: "include",
      });
    }
    setOpen(false);
    load();
    router.push(n.linkUrl);
  }

  return (
    <div style={{ position: "relative" }} ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        style={{
          position: "relative",
          border: "1px solid #ddd",
          background: "#fff",
          borderRadius: 8,
          padding: "8px 12px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ fontSize: 18 }} aria-hidden>
          🔔
        </span>
        {unread > 0 ? (
          <span
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              background: "#dc2626",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "0 4px",
            }}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: 8,
            width: 380,
            maxHeight: 420,
            overflow: "auto",
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
            zIndex: 100,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 12px",
              borderBottom: "1px solid #eee",
              position: "sticky",
              top: 0,
              background: "#fafafa",
            }}
          >
            <strong style={{ fontSize: 14 }}>Notifications</strong>
            <button
              type="button"
              onClick={() => void markAllRead()}
              style={{ fontSize: 12, border: "none", background: "none", color: "#2563eb", cursor: "pointer" }}
            >
              Mark all read
            </button>
          </div>
          {!data || data.notifications.length === 0 ? (
            <p style={{ padding: 16, margin: 0, opacity: 0.75, fontSize: 14 }}>No notifications yet.</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {data.notifications.map((n) => (
                <li key={n.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <button
                    type="button"
                    onClick={() => void onItemClick(n)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "12px 14px",
                      border: "none",
                      background: n.read ? "#fff" : "#f0f7ff",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          background: severityColor(n.severity),
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</span>
                      {!n.read ? (
                        <span style={{ fontSize: 10, color: "#2563eb", fontWeight: 600 }}>New</span>
                      ) : null}
                    </div>
                    <p style={{ margin: "0 0 6px", fontSize: 13, opacity: 0.85, lineHeight: 1.35 }}>{n.description}</p>
                    <time style={{ fontSize: 11, opacity: 0.6 }}>
                      {new Date(n.createdAt).toLocaleString()}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function AppHeader({ user }: { user: HeaderUser }) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/login";
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
        padding: "12px 20px",
        borderBottom: "1px solid #e5e7eb",
        background: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 40,
      }}
    >
      <Link href="/store" style={{ fontWeight: 700, textDecoration: "none", color: "#111" }}>
        RDI
      </Link>
      <nav style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", flex: 1 }}>
        <Link href="/store" style={{ color: "#2563eb", fontSize: 14 }}>
          Stores
        </Link>
        {user.role === "admin" ? (
          <>
            <Link href="/admin/users" style={{ color: "#2563eb", fontSize: 14 }}>
              Admin users
            </Link>
            <Link href="/admin/sales" style={{ color: "#2563eb", fontSize: 14 }}>
              Admin sales
            </Link>
            <Link href="/admin/alerts" style={{ color: "#2563eb", fontSize: 14 }}>
              Admin alerts
            </Link>
            <Link href="/admin/pricebook" style={{ color: "#2563eb", fontSize: 14 }}>
              Pricebook
            </Link>
            <Link href="/admin/fuel" style={{ color: "#2563eb", fontSize: 14 }}>
              Fuel (all stores)
            </Link>
            <Link href="/admin/foodservice" style={{ color: "#2563eb", fontSize: 14 }}>
              Foodservice (admin)
            </Link>
            <Link href="/admin/lottery" style={{ color: "#2563eb", fontSize: 14 }}>
              Lottery (admin)
            </Link>
            <Link href="/admin/scan-data" style={{ color: "#2563eb", fontSize: 14 }}>
              Scan data (admin)
            </Link>
          </>
        ) : null}
        <Link href="/account/notifications" style={{ color: "#2563eb", fontSize: 14 }}>
          Alert preferences
        </Link>
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" }}>
        <span style={{ fontSize: 13, opacity: 0.8 }}>
          {user.firstName} · <code style={{ fontSize: 12 }}>{user.role}</code>
        </span>
        <NotificationBell />
        <button
          type="button"
          onClick={() => void logout()}
          style={{ fontSize: 13, padding: "6px 10px", borderRadius: 6, border: "1px solid #ccc", background: "#fff" }}
        >
          Log out
        </button>
      </div>
    </header>
  );
}
