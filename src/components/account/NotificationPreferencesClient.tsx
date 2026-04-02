"use client";

import { useCallback, useEffect, useState } from "react";

type Prefs = {
  lowStock: boolean;
  voidAlert: boolean;
  delivery: boolean;
  auditReminder: boolean;
  shrinkage: boolean;
  system: boolean;
  fuelTank: boolean;
};

const ROWS: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: "lowStock", label: "Low stock", hint: "When inventory is at or below minimum threshold." },
  { key: "voidAlert", label: "Void & refund spikes", hint: "Unusual void/refund volume for the day." },
  { key: "delivery", label: "Delivery / purchase orders", hint: "Submitted POs waiting to be received." },
  { key: "auditReminder", label: "Inventory audit reminders", hint: "Stores with no recent audit activity." },
  { key: "shrinkage", label: "Shrinkage ratio", hint: "Shrinkage high relative to units sold." },
  { key: "fuelTank", label: "Fuel tank levels", hint: "When underground tanks drop below 25% (warning) or 15% (critical)." },
  { key: "system", label: "System", hint: "General system messages." },
];

export default function NotificationPreferencesClient() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(() => {
    void fetch("/api/user/notification-preferences", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j && typeof j.lowStock === "boolean") setPrefs(j);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(key: keyof Prefs) {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(key);
    await fetch("/api/user/notification-preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ [key]: next[key] }),
    });
    setSaving(null);
    load();
  }

  if (!prefs) {
    return <p style={{ opacity: 0.8 }}>Loading preferences…</p>;
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <p style={{ opacity: 0.85, marginBottom: 20 }}>
        Choose which automated alert categories you want to receive. HQ-wide rules still apply to which roles see
        which severities.
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {ROWS.map((r) => (
          <li
            key={r.key}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "14px 0",
              borderBottom: "1px solid #eee",
            }}
          >
            <input
              type="checkbox"
              id={r.key}
              checked={prefs[r.key]}
              disabled={saving === r.key}
              onChange={() => void toggle(r.key)}
              style={{ marginTop: 4 }}
            />
            <label htmlFor={r.key} style={{ cursor: "pointer", flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{r.label}</div>
              <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>{r.hint}</div>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
