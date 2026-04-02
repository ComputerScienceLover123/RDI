"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { UserRole } from "@prisma/client";
import {
  classifyShiftKind,
  formatMinutesAsTime,
  segmentsForCalendarDay,
  shiftDurationMinutes,
  shiftHoursDecimal,
  minutesFromTimeInput,
} from "@/lib/store/shiftTime";
type StoreOption = { id: string; name: string };

type Employee = { id: string; firstName: string; lastName: string; role: string };

type ShiftRow = {
  id: string;
  employeeId: string;
  shiftDate: string;
  startMinutes: number;
  endMinutes: number;
  templateName: string | null;
  notes: string | null;
  hours: number;
  kind: "morning" | "afternoon" | "night";
};

type TemplateRow = { id: string; name: string; startMinutes: number; endMinutes: number };

type WeekPayload = {
  weekStart: string;
  days: string[];
  employees: Employee[];
  shifts: ShiftRow[];
  weeklyHours: Record<string, number>;
  templates: TemplateRow[];
  canEdit: boolean;
};

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localMondayContaining(ymd: string): string {
  const parts = ymd.split("-").map(Number);
  const y = parts[0]!;
  const mo = parts[1]!;
  const da = parts[2]!;
  const b = new Date(y, mo - 1, da);
  const dow = b.getDay();
  const toMon = dow === 0 ? -6 : 1 - dow;
  b.setDate(b.getDate() + toMon);
  return localYmd(b);
}

function addDaysLocal(ymd: string, delta: number): string {
  const parts = ymd.split("-").map(Number);
  const y = parts[0]!;
  const mo = parts[1]!;
  const da = parts[2]!;
  const b = new Date(y, mo - 1, da);
  b.setDate(b.getDate() + delta);
  return localYmd(b);
}

const KIND_STYLES: Record<
  ShiftRow["kind"],
  { bg: string; border: string; color: string }
> = {
  morning: { bg: "#dbeafe", border: "#3b82f6", color: "#1e3a8a" },
  afternoon: { bg: "#fef3c7", border: "#f59e0b", color: "#92400e" },
  night: { bg: "#ede9fe", border: "#8b5cf6", color: "#5b21b6" },
};

function hoursBarColor(hours: number): string {
  if (hours > 40) return "#b91c1c";
  if (hours >= 36) return "#b45309";
  return "#15803d";
}

function dayShortLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  return dt.toLocaleDateString(undefined, { weekday: "short" });
}

export default function ScheduleClient(props: {
  storeId: string;
  storeName: string;
  userRole: UserRole;
  adminStores: StoreOption[];
}) {
  const { storeId, storeName, userRole, adminStores } = props;
  const [weekMonday, setWeekMonday] = useState(() => localMondayContaining(localYmd(new Date())));
  const [view, setView] = useState<"week" | "day">("week");
  const [focusDay, setFocusDay] = useState<string>(() => localYmd(new Date()));
  const [data, setData] = useState<WeekPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [modal, setModal] = useState<
    | null
    | {
        mode: "create" | "edit";
        employeeId: string;
        dayYmd: string;
        shift?: ShiftRow;
      }
  >(null);
  const [startStr, setStartStr] = useState("09:00");
  const [endStr, setEndStr] = useState("17:00");
  const [notes, setNotes] = useState("");
  const [templateNameField, setTemplateNameField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [newTplName, setNewTplName] = useState("");
  const [tplStart, setTplStart] = useState("06:00");
  const [tplEnd, setTplEnd] = useState("14:00");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const r = await fetch(
      `/api/store/${encodeURIComponent(storeId)}/schedule/week?weekStart=${encodeURIComponent(weekMonday)}`,
      { credentials: "include" },
    );
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      setErr(j?.error ?? "Failed to load schedule");
      setData(null);
      setLoading(false);
      return;
    }
    setData(j as WeekPayload);
    setWeekMonday(j.weekStart);
    const nextDays = j.days as string[];
    setFocusDay((prev) => (nextDays.includes(prev) ? prev : nextDays[0] ?? prev));
    setLoading(false);
  }, [storeId, weekMonday]);

  useEffect(() => {
    void load();
  }, [load]);

  const shiftByKey = useMemo(() => {
    const m = new Map<string, ShiftRow>();
    if (!data) return m;
    for (const s of data.shifts) {
      m.set(`${s.employeeId}|${s.shiftDate}`, s);
    }
    return m;
  }, [data]);

  const openCreate = (employeeId: string, dayYmd: string) => {
    if (!data?.canEdit) return;
    setModal({ mode: "create", employeeId, dayYmd });
    setStartStr("09:00");
    setEndStr("17:00");
    setNotes("");
    setTemplateNameField(null);
  };

  const openEdit = (shift: ShiftRow) => {
    if (!data?.canEdit) return;
    setModal({ mode: "edit", employeeId: shift.employeeId, dayYmd: shift.shiftDate, shift });
    setStartStr(formatMinutesAsTime(shift.startMinutes));
    setEndStr(formatMinutesAsTime(shift.endMinutes));
    setNotes(shift.notes ?? "");
    setTemplateNameField(shift.templateName);
  };

  const closeModal = () => setModal(null);

  const projectedWeeklyHours = useMemo(() => {
    if (!data || !modal) return { hours: 0, over: false };
    const sm = minutesFromTimeInput(startStr);
    const em = minutesFromTimeInput(endStr);
    if (sm === null || em === null) return { hours: 0, over: false };
    const newH = shiftHoursDecimal(sm, em);
    const base = data.weeklyHours[modal.employeeId] ?? 0;
    if (modal.mode === "create") {
      const total = base + newH;
      return { hours: total, over: total > 40 };
    }
    const oldH = modal.shift?.hours ?? 0;
    const total = base - oldH + newH;
    return { hours: total, over: total > 40 };
  }, [data, modal, startStr, endStr]);

  async function saveShift() {
    if (!data?.canEdit || !modal) return;
    const sm = minutesFromTimeInput(startStr);
    const em = minutesFromTimeInput(endStr);
    if (sm === null || em === null) {
      showToast("Invalid start or end time");
      return;
    }
    setSaving(true);
    try {
      if (modal.mode === "create") {
        const r = await fetch(`/api/store/${encodeURIComponent(storeId)}/schedule/shifts`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: modal.employeeId,
            shiftDate: modal.dayYmd,
            startMinutes: sm,
            endMinutes: em,
            templateName: templateNameField,
            notes: notes.trim() || null,
          }),
        });
        const j = await r.json().catch(() => null);
        if (!r.ok) {
          showToast(j?.error ?? "Could not create shift");
          return;
        }
        showToast("Shift saved");
        closeModal();
        await load();
        return;
      }
      const id = modal.shift!.id;
      const r = await fetch(
        `/api/store/${encodeURIComponent(storeId)}/schedule/shifts/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            startMinutes: sm,
            endMinutes: em,
            templateName: templateNameField,
            notes: notes.trim() || null,
          }),
        },
      );
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        showToast(j?.error ?? "Could not update shift");
        return;
      }
      showToast("Shift updated");
      closeModal();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function deleteShift() {
    if (!data?.canEdit || !modal || modal.mode !== "edit" || !modal.shift) return;
    if (!window.confirm("Remove this shift?")) return;
    setSaving(true);
    try {
      const r = await fetch(
        `/api/store/${encodeURIComponent(storeId)}/schedule/shifts/${encodeURIComponent(modal.shift.id)}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => null);
        showToast(j?.error ?? "Could not delete");
        return;
      }
      showToast("Shift removed");
      closeModal();
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function copyPreviousWeek() {
    if (!data?.canEdit) return;
    if (!window.confirm("Replace this week’s schedule with a copy of last week? This clears existing shifts in the current week.")) {
      return;
    }
    const r = await fetch(`/api/store/${encodeURIComponent(storeId)}/schedule/copy-week`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetWeekStart: data.weekStart }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Copy failed");
      return;
    }
    showToast(`Copied ${j.copiedShifts ?? 0} shifts`);
    await load();
  }

  async function addTemplate() {
    if (!data?.canEdit) return;
    const sm = minutesFromTimeInput(tplStart);
    const em = minutesFromTimeInput(tplEnd);
    if (sm === null || em === null) {
      showToast("Invalid template times");
      return;
    }
    const name = newTplName.trim();
    if (!name) {
      showToast("Template name required");
      return;
    }
    const r = await fetch(`/api/store/${encodeURIComponent(storeId)}/schedule/templates`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, startMinutes: sm, endMinutes: em }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Could not save template");
      return;
    }
    showToast("Template saved");
    setNewTplName("");
    await load();
  }

  async function removeTemplate(id: string) {
    if (!data?.canEdit) return;
    if (!window.confirm("Delete this template?")) return;
    const r = await fetch(
      `/api/store/${encodeURIComponent(storeId)}/schedule/templates/${encodeURIComponent(id)}`,
      { method: "DELETE", credentials: "include" },
    );
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      showToast(j?.error ?? "Delete failed");
      return;
    }
    showToast("Template removed");
    await load();
  }

  function applyTemplate(t: TemplateRow) {
    setStartStr(formatMinutesAsTime(t.startMinutes));
    setEndStr(formatMinutesAsTime(t.endMinutes));
    setTemplateNameField(t.name);
  }

  const days = data?.days ?? [];

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
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
                if (id !== storeId) window.location.href = `/store/${encodeURIComponent(id)}/schedule`;
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
        <h1 style={{ margin: "0 0 4px" }}>Schedule · {storeName}</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>
          Week starts Monday · {data?.canEdit ? "You can edit shifts." : "View only."}
        </p>
      </header>

      {toast ? (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "#111827",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 8,
            zIndex: 50,
            boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
          }}
        >
          {toast}
        </div>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setWeekMonday((w) => addDaysLocal(w, -7))}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
        >
          ← Prev week
        </button>
        <button
          type="button"
          onClick={() => setWeekMonday((w) => addDaysLocal(w, 7))}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
        >
          Next week →
        </button>
        <button
          type="button"
          onClick={() => {
            const mon = localMondayContaining(localYmd(new Date()));
            setWeekMonday(mon);
          }}
          style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #2563eb", background: "#eff6ff", cursor: "pointer" }}
        >
          This week
        </button>
        {data?.canEdit ? (
          <button
            type="button"
            onClick={() => void copyPreviousWeek()}
            style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
          >
            Copy previous week
          </button>
        ) : null}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 14, opacity: 0.8 }}>View</span>
          <button
            type="button"
            onClick={() => setView("week")}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: view === "week" ? "#e4e4e7" : "#fff",
              cursor: "pointer",
            }}
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => setView("day")}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              border: "1px solid #ccc",
              background: view === "day" ? "#e4e4e7" : "#fff",
              cursor: "pointer",
            }}
          >
            Day
          </button>
        </div>
      </div>

      {data?.canEdit ? (
        <section
          style={{
            marginBottom: 20,
            padding: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#fafafa",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Shift templates</h3>
          <p style={{ marginTop: 0, fontSize: 14, opacity: 0.85 }}>
            Save patterns like opener / closer / overnight. Pick a template in the shift modal to fill times.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {(data.templates ?? []).map((t) => (
              <span
                key={t.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "4px 10px",
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: 999,
                  fontSize: 13,
                }}
              >
                <strong>{t.name}</strong>
                <span style={{ opacity: 0.75 }}>
                  {formatMinutesAsTime(t.startMinutes)}–{formatMinutesAsTime(t.endMinutes)}
                </span>
                <button
                  type="button"
                  onClick={() => void removeTemplate(t.id)}
                  style={{ border: "none", background: "transparent", color: "#b91c1c", cursor: "pointer", fontSize: 12 }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              Name
              <input
                value={newTplName}
                onChange={(e) => setNewTplName(e.target.value)}
                placeholder="opener"
                style={{ padding: 6, borderRadius: 6, border: "1px solid #ccc", minWidth: 120 }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              Start
              <input
                type="time"
                value={tplStart}
                onChange={(e) => setTplStart(e.target.value)}
                style={{ padding: 6, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
              End
              <input
                type="time"
                value={tplEnd}
                onChange={(e) => setTplEnd(e.target.value)}
                style={{ padding: 6, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </label>
            <button
              type="button"
              onClick={() => void addTemplate()}
              style={{
                padding: "8px 14px",
                borderRadius: 6,
                border: "none",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Add template
            </button>
          </div>
        </section>
      ) : null}

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0, overflow: "auto" }}>
          {loading ? <p>Loading…</p> : null}
          {err ? <p style={{ color: "#b91c1c" }}>{err}</p> : null}
          {!loading && data && view === "week" ? (
            <div style={{ minWidth: 720 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `160px repeat(${days.length}, minmax(96px, 1fr))`,
                  gap: 1,
                  background: "#e5e7eb",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                <div style={{ background: "#f4f4f5", padding: 8, fontWeight: 600, fontSize: 13 }}>Employee</div>
                {days.map((d) => (
                  <div key={d} style={{ background: "#f4f4f5", padding: 8, fontWeight: 600, fontSize: 12, textAlign: "center" }}>
                    <div>{dayShortLabel(d)}</div>
                    <div style={{ opacity: 0.7, fontWeight: 400 }}>{d.slice(5)}</div>
                  </div>
                ))}
                {data.employees.map((emp) => (
                  <Fragment key={emp.id}>
                    <div
                      style={{
                        background: "#fff",
                        padding: 8,
                        fontSize: 13,
                        display: "flex",
                        alignItems: "center",
                        borderTop: "1px solid #f4f4f5",
                      }}
                    >
                      <span>
                        {emp.firstName} {emp.lastName}
                        <span style={{ opacity: 0.6, fontSize: 11, marginLeft: 6 }}>({emp.role})</span>
                      </span>
                    </div>
                    {days.map((d) => {
                      const sh = shiftByKey.get(`${emp.id}|${d}`);
                      const st = sh ? KIND_STYLES[sh.kind] : null;
                      return (
                        <div
                          key={`${emp.id}|${d}`}
                          onClick={() => {
                            if (!data.canEdit) return;
                            if (sh) openEdit(sh);
                            else openCreate(emp.id, d);
                          }}
                          style={{
                            background: sh ? st!.bg : "#fff",
                            borderTop: "1px solid #f4f4f5",
                            minHeight: 56,
                            padding: 6,
                            fontSize: 12,
                            cursor: data.canEdit ? "pointer" : "default",
                            borderLeft: sh ? `3px solid ${st!.border}` : "3px solid transparent",
                            color: sh ? st!.color : "#71717a",
                          }}
                        >
                          {sh ? (
                            <>
                              <div style={{ fontWeight: 600 }}>
                                {formatMinutesAsTime(sh.startMinutes)} – {formatMinutesAsTime(sh.endMinutes)}
                              </div>
                              <div style={{ opacity: 0.85 }}>{sh.hours}h</div>
                              {sh.notes ? <div style={{ fontSize: 11, marginTop: 2, opacity: 0.8 }}>{sh.notes}</div> : null}
                            </>
                          ) : (
                            <span style={{ opacity: 0.45 }}>Off</span>
                          )}
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8, display: "flex", gap: 16, flexWrap: "wrap" }}>
                <span>
                  <span style={{ display: "inline-block", width: 12, height: 12, background: KIND_STYLES.morning.bg, border: `1px solid ${KIND_STYLES.morning.border}`, marginRight: 6, verticalAlign: "middle" }} />
                  Morning
                </span>
                <span>
                  <span style={{ display: "inline-block", width: 12, height: 12, background: KIND_STYLES.afternoon.bg, border: `1px solid ${KIND_STYLES.afternoon.border}`, marginRight: 6, verticalAlign: "middle" }} />
                  Afternoon
                </span>
                <span>
                  <span
                    style={{
                      display: "inline-block",
                      width: 12,
                      height: 12,
                      background: KIND_STYLES.night.bg,
                      border: `1px solid ${KIND_STYLES.night.border}`,
                      marginRight: 6,
                      verticalAlign: "middle",
                    }}
                  />
                  Night / overnight
                </span>
              </div>
            </div>
          ) : null}

          {!loading && data && view === "day" ? (
            <div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                {days.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setFocusDay(d)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: 6,
                      border: "1px solid #ccc",
                      background: focusDay === d ? "#e4e4e7" : "#fff",
                      cursor: "pointer",
                      fontSize: 13,
                    }}
                  >
                    {dayShortLabel(d)} {d.slice(5)}
                  </button>
                ))}
              </div>
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  overflow: "hidden",
                  background: "#fafafa",
                }}
              >
                <div style={{ position: "relative", height: 28, borderBottom: "1px solid #e5e7eb", background: "#f4f4f5" }}>
                  {Array.from({ length: 13 }).map((_, i) => {
                    const hour = 6 + i;
                    const left = (hour * 60 / 1440) * 100;
                    return (
                      <span
                        key={hour}
                        style={{
                          position: "absolute",
                          left: `${left}%`,
                          top: 4,
                          fontSize: 11,
                          color: "#71717a",
                          transform: "translateX(-50%)",
                        }}
                      >
                        {hour > 12 ? hour - 12 : hour}
                        {hour >= 12 ? "p" : "a"}
                      </span>
                    );
                  })}
                </div>
                {data.employees.map((emp) => {
                  const rowShifts = data.shifts.filter(
                    (s) =>
                      s.employeeId === emp.id &&
                      segmentsForCalendarDay(s.shiftDate, s.startMinutes, s.endMinutes, focusDay).length > 0,
                  );
                  return (
                    <div
                      key={emp.id}
                      style={{
                        position: "relative",
                        height: 44,
                        borderBottom: "1px solid #eee",
                        background: "#fff",
                      }}
                    >
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          bottom: 0,
                          width: 140,
                          padding: "0 8px",
                          display: "flex",
                          alignItems: "center",
                          fontSize: 12,
                          background: "#fafafa",
                          borderRight: "1px solid #e5e7eb",
                          zIndex: 2,
                        }}
                      >
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div style={{ marginLeft: 140, position: "relative", height: "100%" }}>
                        {rowShifts.map((s) => {
                          const segs = segmentsForCalendarDay(s.shiftDate, s.startMinutes, s.endMinutes, focusDay);
                          const kind = classifyShiftKind(s.startMinutes, s.endMinutes);
                          const st = KIND_STYLES[kind];
                          return segs.map((seg, idx) => {
                            const w = ((seg.toMin - seg.fromMin) / 1440) * 100;
                            const left = (seg.fromMin / 1440) * 100;
                            const durMin = seg.toMin - seg.fromMin;
                            return (
                              <div
                                key={`${s.id}-${idx}`}
                                onClick={() => data.canEdit && openEdit(s)}
                                style={{
                                  position: "absolute",
                                  left: `${left}%`,
                                  width: `${w}%`,
                                  top: 4,
                                  bottom: 4,
                                  background: st.bg,
                                  border: `1px solid ${st.border}`,
                                  borderRadius: 4,
                                  fontSize: 11,
                                  padding: "2px 4px",
                                  overflow: "hidden",
                                  whiteSpace: "nowrap",
                                  cursor: data.canEdit ? "pointer" : "default",
                                  color: st.color,
                                }}
                                title={s.notes ?? undefined}
                              >
                                {formatMinutesAsTime(seg.fromMin)}–{formatMinutesAsTime(seg.toMin)} (
                                {(durMin / 60).toFixed(1)}h)
                              </div>
                            );
                          });
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>

        <aside
          style={{
            width: 240,
            flexShrink: 0,
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 12,
            background: "#fafafa",
            position: "sticky",
            top: 16,
            alignSelf: "flex-start",
          }}
        >
          <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16 }}>Weekly hours</h3>
          {!data ? null : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {data.employees.map((e) => {
                const h = data.weeklyHours[e.id] ?? 0;
                const pct = Math.min(100, (h / 40) * 100);
                const col = hoursBarColor(h);
                return (
                  <li key={e.id} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                      {e.firstName} {e.lastName}
                    </div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>
                      <strong>{h.toFixed(1)}</strong> / 40 hrs
                      {h > 40 ? <span style={{ color: "#b91c1c", marginLeft: 6 }}>Over 40</span> : null}
                      {h >= 36 && h <= 40 ? <span style={{ color: "#b45309", marginLeft: 6 }}>Near limit</span> : null}
                    </div>
                    <div style={{ height: 8, background: "#e5e7eb", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: col, transition: "width 0.2s" }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>

      {modal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 40,
            padding: 16,
          }}
          onClick={closeModal}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              maxWidth: 420,
              width: "100%",
              padding: 20,
              boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>{modal.mode === "create" ? "New shift" : "Edit shift"}</h2>
            {data ? (
              <p style={{ fontSize: 14, opacity: 0.8 }}>
                {data.employees.find((e) => e.id === modal.employeeId)?.firstName}{" "}
                {data.employees.find((e) => e.id === modal.employeeId)?.lastName} · {modal.dayYmd}
              </p>
            ) : null}
            {data?.canEdit && (data.templates?.length ?? 0) > 0 ? (
              <label style={{ display: "block", marginBottom: 12, fontSize: 14 }}>
                Apply template
                <select
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    const t = data.templates.find((x) => x.id === id);
                    if (t) applyTemplate(t);
                    e.target.value = "";
                  }}
                  style={{ display: "block", width: "100%", marginTop: 4, padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
                >
                  <option value="">— Select —</option>
                  {data.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({formatMinutesAsTime(t.startMinutes)}–{formatMinutesAsTime(t.endMinutes)})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label style={{ display: "block", marginBottom: 12, fontSize: 14 }}>
              Start
              <input
                type="time"
                value={startStr}
                onChange={(e) => setStartStr(e.target.value)}
                style={{ display: "block", width: "100%", marginTop: 4, padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ display: "block", marginBottom: 12, fontSize: 14 }}>
              End
              <input
                type="time"
                value={endStr}
                onChange={(e) => setEndStr(e.target.value)}
                style={{ display: "block", width: "100%", marginTop: 4, padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </label>
            <p style={{ fontSize: 14 }}>
              Shift length:{" "}
              <strong>
                {(() => {
                  const sm = minutesFromTimeInput(startStr);
                  const em = minutesFromTimeInput(endStr);
                  if (sm === null || em === null) return "—";
                  const m = shiftDurationMinutes(sm, em);
                  if (m <= 0) return "—";
                  return `${(m / 60).toFixed(2)} hrs`;
                })()}
              </strong>
            </p>
            <p style={{ fontSize: 14, color: projectedWeeklyHours.over ? "#b91c1c" : "#374151" }}>
              Week total for this employee: <strong>{projectedWeeklyHours.hours.toFixed(2)}</strong> hrs
              {projectedWeeklyHours.over ? " — exceeds 40 hours" : ""}
            </p>
            <label style={{ display: "block", marginBottom: 12, fontSize: 14 }}>
              Notes (optional)
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                style={{ display: "block", width: "100%", marginTop: 4, padding: 8, borderRadius: 6, border: "1px solid #ccc", resize: "vertical" }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
              <button
                type="button"
                onClick={() => void saveShift()}
                disabled={saving}
                style={{
                  padding: "10px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: "#2563eb",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: saving ? "wait" : "pointer",
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={closeModal}
                style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
              >
                Cancel
              </button>
              {modal.mode === "edit" ? (
                <button
                  type="button"
                  onClick={() => void deleteShift()}
                  disabled={saving}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 8,
                    border: "1px solid #fecaca",
                    background: "#fef2f2",
                    color: "#b91c1c",
                    cursor: saving ? "wait" : "pointer",
                    marginLeft: "auto",
                  }}
                >
                  Delete
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
