"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { UserRole } from "@prisma/client";

type Denoms = {
  hundreds: number;
  fifties: number;
  twenties: number;
  tens: number;
  fives: number;
  ones: number;
  quarters: number;
  dimes: number;
  nickels: number;
  pennies: number;
};

type Dashboard = {
  role: UserRole;
  openRegisters: Array<{
    id: string;
    registerName: string;
    openedAt: string;
    openingCashAmount: string;
  }>;
  pendingClose: Array<{
    id: string;
    registerName: string;
    openedAt: string;
    closedAt: string;
    closedByEmployeeId: string;
    closingCashAmount: string | null;
    expectedClosingAmount: string | null;
    overShortAmount: string | null;
    closeVerifiedAt: string | null;
  }>;
  pendingDrops: Array<{
    id: string;
    registerId: string;
    registerName: string;
    amountDropped: string;
    dropType: "safe_drop" | "bank_deposit" | "change_order_received";
    employeeName: string;
    droppedAt: string;
    notes: string | null;
  }>;
  safe: null | {
    expectedSafeBalance: string;
    lastSafeCountAt: string | null;
    lastSafeCountTotal: string | null;
    lastSafeDenominationBreakdown: unknown | null;
  };
};

function zeroDenoms(): Denoms {
  return { hundreds: 0, fifties: 0, twenties: 0, tens: 0, fives: 0, ones: 0, quarters: 0, dimes: 0, nickels: 0, pennies: 0 };
}

function DenomEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Denoms;
  onChange: (v: Denoms) => void;
}) {
  const rows = useMemo(
    () => [
      { k: "hundreds", v: 100 },
      { k: "fifties", v: 50 },
      { k: "twenties", v: 20 },
      { k: "tens", v: 10 },
      { k: "fives", v: 5 },
      { k: "ones", v: 1 },
    ],
    []
  );
  const coinRows = useMemo(
    () => [
      { k: "quarters", v: 0.25 },
      { k: "dimes", v: 0.1 },
      { k: "nickels", v: 0.05 },
      { k: "pennies", v: 0.01 },
    ],
    []
  );

  return (
    <div style={{ padding: 12, background: "#f9fafb", borderRadius: 10, border: "1px solid #eef2f7" }}>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        {rows.map((r) => (
          <label key={r.k} style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>
              {r.k} (${r.v})
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={(value as any)[r.k]}
              onChange={(e) =>
                onChange({
                  ...value,
                  [r.k]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                })
              }
              style={{ width: "100%" }}
            />
          </label>
        ))}
      </div>
      <div style={{ height: 10 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        {coinRows.map((r) => (
          <label key={r.k} style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.75 }}>
              {r.k} (${r.v})
            </span>
            <input
              type="number"
              min={0}
              step={1}
              value={(value as any)[r.k]}
              onChange={(e) =>
                onChange({
                  ...value,
                  [r.k]: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                })
              }
              style={{ width: "100%" }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export default function CashManagementClient({ storeId }: { storeId: string }) {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [openRegisterName, setOpenRegisterName] = useState("Register 1");
  const [openNotes, setOpenNotes] = useState("");
  const [openDenoms, setOpenDenoms] = useState<Denoms>(zeroDenoms());
  const [openBusy, setOpenBusy] = useState(false);

  const [closeRegisterId, setCloseRegisterId] = useState<string>("");
  const [closeNotes, setCloseNotes] = useState("");
  const [closeDenoms, setCloseDenoms] = useState<Denoms>(zeroDenoms());
  const [closeBusy, setCloseBusy] = useState(false);

  const [safeNotes, setSafeNotes] = useState("");
  const [safeDenoms, setSafeDenoms] = useState<Denoms>(zeroDenoms());
  const [safeBusy, setSafeBusy] = useState(false);

  const [dropRegisterId, setDropRegisterId] = useState<string>("");
  const [dropType, setDropType] = useState<"safe_drop" | "bank_deposit" | "change_order_received">("safe_drop");
  const [dropAmount, setDropAmount] = useState<number>(0);
  const [dropNotes, setDropNotes] = useState<string>("");
  const [dropBusy, setDropBusy] = useState(false);

  const [reconDate, setReconDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [recon, setRecon] = useState<any>(null);
  const [reconLoading, setReconLoading] = useState(false);

  const [historyFrom, setHistoryFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [historyTo, setHistoryTo] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [historyRegisterId, setHistoryRegisterId] = useState<string>("");
  const [historyDropType, setHistoryDropType] = useState<string>("");
  const [historyEmployeeId, setHistoryEmployeeId] = useState<string>("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/cash/dashboard`, { credentials: "include" });
    if (!res.ok) {
      setErr("Could not load cash dashboard.");
      setLoading(false);
      return;
    }
    const j = await res.json();
    setDash({
      ...j,
      openRegisters: (j.openRegisters ?? []).map((r: any) => ({
        ...r,
        openedAt: new Date(r.openedAt).toISOString(),
        openingCashAmount: r.openingCashAmount?.toString?.() ?? String(r.openingCashAmount ?? "0"),
      })),
      pendingClose: (j.pendingClose ?? []).map((c: any) => ({
        ...c,
        openedAt: c.openedAt ? new Date(c.openedAt).toISOString() : "",
        closedAt: c.closedAt ? new Date(c.closedAt).toISOString() : "",
        closingCashAmount: c.closingCashAmount?.toString?.() ?? (c.closingCashAmount ?? null),
        expectedClosingAmount: c.expectedClosingAmount?.toString?.() ?? (c.expectedClosingAmount ?? null),
        overShortAmount: c.overShortAmount?.toString?.() ?? (c.overShortAmount ?? null),
        closeVerifiedAt: c.closeVerifiedAt ? new Date(c.closeVerifiedAt).toISOString() : null,
      })),
    });

    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!dash) return;
    if (!closeRegisterId && dash.openRegisters.length > 0) setCloseRegisterId(dash.openRegisters[0]!.id);
    if (!dropRegisterId && dash.openRegisters.length > 0) setDropRegisterId(dash.openRegisters[0]!.id);
  }, [dash, closeRegisterId, dropRegisterId]);

  function showToast(m: string) {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  }

  async function submitOpen() {
    setOpenBusy(true);
    try {
      const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/cash/register/open`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          registerName: openRegisterName,
          denominationBreakdown: openDenoms,
          notes: openNotes || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Open register failed");
      showToast("Register opened");
      setOpenDenoms(zeroDenoms());
      setOpenNotes("");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Open failed");
    } finally {
      setOpenBusy(false);
    }
  }

  async function submitClose() {
    if (!closeRegisterId) return;
    setCloseBusy(true);
    try {
      const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/cash/register/close`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          registerId: closeRegisterId,
          denominationBreakdown: closeDenoms,
          notes: closeNotes || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? j.message ?? "Close failed");
      showToast(j.flag === "critical" ? "Register close submitted (CRITICAL)" : j.flag === "warning" ? "Register close submitted (warning)" : "Register close submitted");
      setCloseDenoms(zeroDenoms());
      setCloseNotes("");
      await load();
      void load(); // refresh dashboard
    } catch (e: any) {
      setErr(e?.message ?? "Close failed");
    } finally {
      setCloseBusy(false);
    }
  }

  async function verifyClose(registerIdToVerify: string) {
    const res = await fetch(
      `/api/store/${encodeURIComponent(storeId)}/cash/register/${encodeURIComponent(registerIdToVerify)}/verify-close`,
      { method: "POST", credentials: "include" }
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      showToast(j.error ?? "Verify failed");
      return;
    }
    showToast("Register close verified");
    await load();
  }

  async function submitSafeCount() {
    setSafeBusy(true);
    try {
      const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/cash/safe/count`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ denominationBreakdown: safeDenoms, notes: safeNotes || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? j.message ?? "Safe count failed");
      showToast(j.flag === "warning" ? "Safe counted (mismatch > $25)" : "Safe counted");
      setSafeDenoms(zeroDenoms());
      setSafeNotes("");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Safe count failed");
    } finally {
      setSafeBusy(false);
    }
  }

  async function submitDrop() {
    if (!dropRegisterId || dropAmount <= 0) {
      showToast("Enter drop amount");
      return;
    }
    setDropBusy(true);
    try {
      const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/cash/drops`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          registerId: dropRegisterId,
          dropType,
          amountDropped: dropAmount,
          notes: dropNotes || undefined,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Drop failed");
      showToast("Drop logged");
      setDropAmount(0);
      setDropNotes("");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "Drop failed");
    } finally {
      setDropBusy(false);
    }
  }

  async function verifyDrop(dropId: string) {
    const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/cash/drops/${encodeURIComponent(dropId)}/verify`, {
      method: "POST",
      credentials: "include",
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(j.error ?? "Verify failed");
      return;
    }
    showToast("Drop verified");
    await load();
  }

  async function loadRecon() {
    setReconLoading(true);
    try {
      const res = await fetch(
        `/api/store/${encodeURIComponent(storeId)}/cash/reconciliation?date=${encodeURIComponent(reconDate)}`,
        { credentials: "include" }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Reconciliation failed");
      setRecon(j);
    } catch (e: any) {
      setErr(e?.message ?? "Reconciliation failed");
    } finally {
      setReconLoading(false);
    }
  }

  useEffect(() => {
    if (!dash) return;
    void loadRecon();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dash]);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const p = new URLSearchParams();
      p.set("dateFrom", historyFrom);
      p.set("dateTo", historyTo);
      if (historyRegisterId.trim()) p.set("registerId", historyRegisterId.trim());
      if (historyDropType.trim()) p.set("dropType", historyDropType.trim());
      if (historyEmployeeId.trim()) p.set("employeeId", historyEmployeeId.trim());

      const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/cash/history?${p.toString()}`, { credentials: "include" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "History failed");
      setHistory(j);
    } catch (e: any) {
      setErr(e?.message ?? "History failed");
    } finally {
      setHistoryLoading(false);
    }
  }

  const canManageSafe = dash?.role === "admin" || dash?.role === "manager";

  if (loading || !dash) return <main style={{ padding: 24 }}>Loading cash…</main>;

  const openRegs = dash.openRegisters;
  const firstOpenId = openRegs[0]?.id ?? "";

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <p>
        <Link href={`/store/${encodeURIComponent(storeId)}`} style={{ color: "#2563eb" }}>
          ← Store
        </Link>{" "}
        · Cash management
      </p>
      {toast ? (
        <div style={{ padding: 12, background: "#111827", color: "#fff", borderRadius: 8, marginBottom: 14 }}>{toast}</div>
      ) : null}
      {err ? <div style={{ marginBottom: 14, padding: 12, border: "1px solid #fca5a5", borderRadius: 8, background: "#fff1f2" }}>{err}</div> : null}

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 18 }}>
        <div>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Register open</h2>
          <p style={{ opacity: 0.8, fontSize: 13 }}>Start a shift by counting and opening a register.</p>
          <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
            Register name/number
            <input value={openRegisterName} onChange={(e) => setOpenRegisterName(e.target.value)} style={{ padding: 8 }} />
          </label>
          <DenomEditor label="Opening denomination breakdown" value={openDenoms} onChange={setOpenDenoms} />
          <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
            Notes (optional)
            <input value={openNotes} onChange={(e) => setOpenNotes(e.target.value)} style={{ padding: 8 }} />
          </label>
          <button type="button" onClick={() => void submitOpen()} disabled={openBusy} style={{ marginTop: 12, padding: "10px 16px" }}>
            {openBusy ? "Opening…" : "Open register"}
          </button>
        </div>

        <div>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Register close</h2>
          <p style={{ opacity: 0.8, fontSize: 13 }}>End a shift by counting and submitting a closing cash count for manager approval.</p>

          <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
            Register to close
            <select value={closeRegisterId || firstOpenId} onChange={(e) => setCloseRegisterId(e.target.value)} disabled={openRegs.length === 0} style={{ padding: 8 }}>
              {openRegs.length === 0 ? <option value="">No open registers</option> : null}
              {openRegs.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.registerName} · opened {new Date(r.openedAt).toLocaleString()}
                </option>
              ))}
            </select>
          </label>

          <DenomEditor label="Closing denomination breakdown" value={closeDenoms} onChange={setCloseDenoms} />
          <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
            Notes (optional)
            <input value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} style={{ padding: 8 }} />
          </label>

          <button
            type="button"
            onClick={() => void submitClose()}
            disabled={closeBusy || openRegs.length === 0 || !closeRegisterId}
            style={{ marginTop: 12, padding: "10px 16px" }}
          >
            {closeBusy ? "Submitting…" : "Submit register close"}
          </button>
        </div>
      </section>

      {canManageSafe ? (
        <section style={{ marginBottom: 18 }}>
          <h2 style={{ marginTop: 0, fontSize: 18 }}>Safe count (manager)</h2>
          <p style={{ opacity: 0.8, fontSize: 13 }}>Record the current safe balance. The system will compare against the expected safe balance.</p>
          {dash.safe ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
              <div style={{ padding: 12, background: "#eff6ff", borderRadius: 10, minWidth: 180 }}>
                <div style={{ fontSize: 13, opacity: 0.8 }}>Expected safe</div>
                <div style={{ fontSize: 26, fontWeight: 800 }}>${dash.safe.expectedSafeBalance}</div>
              </div>
              <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10, minWidth: 220 }}>
                <div style={{ fontSize: 13, opacity: 0.8 }}>Last safe count</div>
                <div style={{ fontSize: 14 }}>
                  {dash.safe.lastSafeCountAt ? new Date(dash.safe.lastSafeCountAt).toLocaleString() : "—"} · {dash.safe.lastSafeCountTotal ?? "0.00"}
                </div>
              </div>
            </div>
          ) : null}

          <DenomEditor label="Safe denomination breakdown" value={safeDenoms} onChange={setSafeDenoms} />
          <label style={{ display: "grid", gap: 6, marginTop: 10 }}>
            Notes (optional)
            <input value={safeNotes} onChange={(e) => setSafeNotes(e.target.value)} style={{ padding: 8 }} />
          </label>
          <button type="button" onClick={() => void submitSafeCount()} disabled={safeBusy} style={{ marginTop: 12, padding: "10px 16px" }}>
            {safeBusy ? "Counting…" : "Submit safe count"}
          </button>
        </section>
      ) : null}

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Safe drops & deposits</h2>
        <p style={{ opacity: 0.8, fontSize: 13 }}>
          Employees can log safe drops from an open register. Managers verify all drops.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ padding: 14, borderRadius: 10, background: "#f9fafb", border: "1px solid #eef2f7" }}>
            <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              Register
              <select value={dropRegisterId || firstOpenId} onChange={(e) => setDropRegisterId(e.target.value)} disabled={openRegs.length === 0} style={{ padding: 8 }}>
                {openRegs.length === 0 ? <option value="">No open registers</option> : null}
                {openRegs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.registerName}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              Drop type
              <select
                value={dropType}
                onChange={(e) => setDropType(e.target.value as any)}
                disabled={dash.role === "employee"}
                style={{ padding: 8 }}
              >
                {dash.role === "employee" ? <option value="safe_drop">safe_drop</option> : null}
                {dash.role !== "employee" ? (
                  <>
                    <option value="safe_drop">safe_drop</option>
                    <option value="bank_deposit">bank_deposit</option>
                    <option value="change_order_received">change_order_received</option>
                  </>
                ) : null}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              Amount ($)
              <input
                type="number"
                min={0}
                step={0.01}
                value={dropAmount}
                onChange={(e) => setDropAmount(Number(e.target.value))}
                style={{ padding: 8 }}
              />
            </label>

            <label style={{ display: "grid", gap: 6, marginBottom: 10 }}>
              Notes (optional)
              <input value={dropNotes} onChange={(e) => setDropNotes(e.target.value)} style={{ padding: 8 }} />
            </label>

            <button type="button" onClick={() => void submitDrop()} disabled={dropBusy || openRegs.length === 0} style={{ padding: "10px 16px" }}>
              {dropBusy ? "Logging…" : "Log drop"}
            </button>
          </div>

          {canManageSafe ? (
            <div>
              <h3 style={{ marginTop: 0, fontSize: 16 }}>Manager verification queue</h3>
              <div style={{ overflowX: "auto", marginBottom: 18 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                      <th style={{ padding: 8 }}>Drop</th>
                      <th style={{ padding: 8 }}>Employee</th>
                      <th style={{ padding: 8 }}>Amount</th>
                      <th style={{ padding: 8 }}>When</th>
                      <th style={{ padding: 8 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {dash.pendingDrops.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 8, opacity: 0.7 }}>
                          No unverified drops.
                        </td>
                      </tr>
                    ) : (
                      dash.pendingDrops.map((d) => (
                        <tr key={d.id} style={{ borderBottom: "1px solid #eee" }}>
                          <td style={{ padding: 8 }}>
                            <code>{d.dropType}</code> · {d.registerName}
                          </td>
                          <td style={{ padding: 8 }}>{d.employeeName}</td>
                          <td style={{ padding: 8 }}>${d.amountDropped}</td>
                          <td style={{ padding: 8 }}>{new Date(d.droppedAt).toLocaleString()}</td>
                          <td style={{ padding: 8 }}>
                            <button type="button" onClick={() => void verifyDrop(d.id)} style={{ padding: "6px 10px" }}>
                              Verify
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 style={{ marginTop: 0, fontSize: 16 }}>Register close approvals</h3>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                        <th style={{ padding: 8 }}>Register</th>
                        <th style={{ padding: 8 }}>Expected</th>
                        <th style={{ padding: 8 }}>Actual</th>
                        <th style={{ padding: 8 }}>Over/Short</th>
                        <th style={{ padding: 8 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {dash.pendingClose.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: 8, opacity: 0.7 }}>
                            No unverified register closes.
                          </td>
                        </tr>
                      ) : (
                        dash.pendingClose.map((r) => (
                          <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                            <td style={{ padding: 8 }}>
                              {r.registerName} <span style={{ opacity: 0.75 }}>· closed {new Date(r.closedAt).toLocaleString()}</span>
                            </td>
                            <td style={{ padding: 8 }}>${r.expectedClosingAmount ?? "—"}</td>
                            <td style={{ padding: 8 }}>${r.closingCashAmount ?? "—"}</td>
                            <td style={{ padding: 8, color: r.overShortAmount && Math.abs(Number(r.overShortAmount)) > 20 ? "#b91c1c" : r.overShortAmount && Math.abs(Number(r.overShortAmount)) > 5 ? "#b45309" : undefined }}>
                              ${r.overShortAmount ?? "—"}
                            </td>
                            <td style={{ padding: 8 }}>
                              <button type="button" onClick={() => void verifyClose(r.id)} style={{ padding: "6px 10px" }}>
                                Approve
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section style={{ marginBottom: 18 }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Daily cash reconciliation</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end", marginBottom: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            Date
            <input type="date" value={reconDate} onChange={(e) => setReconDate(e.target.value)} />
          </label>
          <button type="button" onClick={() => void loadRecon()} disabled={reconLoading} style={{ padding: "10px 16px" }}>
            {reconLoading ? "Loading…" : "Load reconciliation"}
          </button>
        </div>
        {reconLoading ? <p style={{ opacity: 0.8 }}>Loading…</p> : null}
        {recon ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                  <th style={{ padding: 8 }}>Register</th>
                  <th style={{ padding: 8 }}>Over/Short</th>
                  <th style={{ padding: 8 }}>Expected</th>
                  <th style={{ padding: 8 }}>Actual</th>
                </tr>
              </thead>
              <tbody>
                {recon.registers.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: 8, opacity: 0.7 }}>
                      No verified register closes for this date.
                    </td>
                  </tr>
                ) : (
                  recon.registers.map((r: any) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: 8 }}>{r.registerName}</td>
                      <td style={{ padding: 8 }}>
                        ${r.overShortAmount ?? "—"}
                      </td>
                      <td style={{ padding: 8 }}>${r.expectedClosingAmount ?? "—"}</td>
                      <td style={{ padding: 8 }}>${r.closingCashAmount ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12 }}>
              <div style={{ padding: 12, background: "#f0fdf4", borderRadius: 10 }}>
                <div style={{ fontSize: 13, opacity: 0.8 }}>Store total cash over/short (net)</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>${recon.storeTotalCashOverShort}</div>
              </div>
              <div style={{ padding: 12, background: "#eff6ff", borderRadius: 10 }}>
                <div style={{ fontSize: 13, opacity: 0.8 }}>Total safe drops</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>${recon.totalSafeDrops}</div>
              </div>
              {recon.safe ? (
                <div style={{ padding: 12, background: "#f8fafc", borderRadius: 10, minWidth: 260 }}>
                  <div style={{ fontSize: 13, opacity: 0.8 }}>Safe expected vs counted</div>
                  <div style={{ fontSize: 14, marginTop: 4 }}>
                    Expected: <strong>${recon.safe.expectedSafeBalance ?? "—"}</strong>
                    <br />
                    Counted: <strong>${recon.safe.countedSafeBalance ?? "—"}</strong>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Cash history</h2>
        <p style={{ opacity: 0.8, fontSize: 13 }}>Search by date range, register, employee, and drop type.</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <label style={{ display: "grid", gap: 6 }}>
            From
            <input type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            To
            <input type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            Register ID (optional)
            <input value={historyRegisterId} onChange={(e) => setHistoryRegisterId(e.target.value)} style={{ padding: 8, width: 200 }} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            Drop type (optional)
            <select value={historyDropType} onChange={(e) => setHistoryDropType(e.target.value)} style={{ padding: 8, width: 220 }}>
              <option value="">Any</option>
              <option value="safe_drop">safe_drop</option>
              <option value="bank_deposit">bank_deposit</option>
              <option value="change_order_received">change_order_received</option>
            </select>
          </label>
          {dash.role !== "employee" ? (
            <label style={{ display: "grid", gap: 6 }}>
              Employee ID (optional)
              <input value={historyEmployeeId} onChange={(e) => setHistoryEmployeeId(e.target.value)} style={{ padding: 8, width: 200 }} />
            </label>
          ) : null}
          <button type="button" disabled={historyLoading} onClick={() => void loadHistory()} style={{ padding: "10px 16px" }}>
            {historyLoading ? "Loading…" : "Search"}
          </button>
        </div>

        {history ? (
          <div style={{ marginTop: 18, overflowX: "auto" }}>
            <h3 style={{ fontSize: 16, marginTop: 0 }}>Register closes</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 18 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                  <th style={{ padding: 8 }}>Register</th>
                  <th style={{ padding: 8 }}>Closed by</th>
                  <th style={{ padding: 8 }}>When</th>
                  <th style={{ padding: 8 }}>Over/Short</th>
                  <th style={{ padding: 8 }}>Verified</th>
                </tr>
              </thead>
              <tbody>
                {(history.registerClosures ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 8, opacity: 0.7 }}>
                      No register closures found.
                    </td>
                  </tr>
                ) : (
                  history.registerClosures.map((r: any) => (
                    <tr key={r.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: 8 }}>{r.registerName}</td>
                      <td style={{ padding: 8 }}>{r.closedByEmployeeId}</td>
                      <td style={{ padding: 8 }}>{new Date(r.closedAt).toLocaleString()}</td>
                      <td style={{ padding: 8 }}>${r.overShortAmount ?? "—"}</td>
                      <td style={{ padding: 8 }}>{r.closeVerifiedAt ? "Yes" : "No"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <h3 style={{ fontSize: 16, marginTop: 0 }}>Cash drops / deposits</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                  <th style={{ padding: 8 }}>Type</th>
                  <th style={{ padding: 8 }}>Register</th>
                  <th style={{ padding: 8 }}>Employee</th>
                  <th style={{ padding: 8 }}>Amount</th>
                  <th style={{ padding: 8 }}>When</th>
                  <th style={{ padding: 8 }}>Verified</th>
                </tr>
              </thead>
              <tbody>
                {(history.drops ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 8, opacity: 0.7 }}>
                      No cash drops found.
                    </td>
                  </tr>
                ) : (
                  history.drops.map((d: any) => (
                    <tr key={d.id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: 8 }}>
                        <code>{d.dropType}</code>
                      </td>
                      <td style={{ padding: 8 }}>{d.register?.registerName ?? "—"}</td>
                      <td style={{ padding: 8 }}>{d.employeeId}</td>
                      <td style={{ padding: 8 }}>${d.amountDropped.toFixed(2)}</td>
                      <td style={{ padding: 8 }}>{new Date(d.droppedAt).toLocaleString()}</td>
                      <td style={{ padding: 8 }}>{d.verified ? "Yes" : "No"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}

