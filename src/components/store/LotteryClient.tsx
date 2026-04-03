"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LOTTERY_TICKET_PRICES } from "@/lib/lottery/prices";

type PackRow = {
  id: string;
  gameName: string;
  packNumber: string;
  ticketCountPerPack: number;
  ticketPrice: string;
  status: string;
  activatedAt: string | null;
  daysActive: number | null;
  stale: boolean;
};

type SettlementRow = {
  id: string;
  packNumber: string;
  gameName: string;
  ticketsSoldCount: number;
  expectedRevenue: string;
  actualCashCollected: string;
  overShortAmount: string;
  warnLargeDiscrepancy: boolean;
  settlementDate: string;
  settledByName: string;
  notes: string | null;
};

export default function LotteryClient(props: {
  storeId: string;
  storeName: string;
  canManage: boolean;
}) {
  const { storeId, storeName, canManage } = props;
  const base = `/api/store/${encodeURIComponent(storeId)}/lottery`;
  const [active, setActive] = useState<PackRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "activate" | "settle" | "history">("active");

  const [actGame, setActGame] = useState("");
  const [actPack, setActPack] = useState("");
  const [actCount, setActCount] = useState("300");
  const [actPrice, setActPrice] = useState("5");
  const [confirmPack, setConfirmPack] = useState<Record<string, unknown> | null>(null);

  const [settlePackId, setSettlePackId] = useState("");
  const [settleRemain, setSettleRemain] = useState("0");
  const [settleCash, setSettleCash] = useState("");
  const [settleNotes, setSettleNotes] = useState("");

  const [invGame, setInvGame] = useState("");
  const [invPack, setInvPack] = useState("");
  const [invCount, setInvCount] = useState("300");
  const [invPrice, setInvPrice] = useState("5");

  const [histFrom, setHistFrom] = useState("");
  const [histTo, setHistTo] = useState("");
  const [histGame, setHistGame] = useState("");
  const [histPack, setHistPack] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadActive = useCallback(async () => {
    const r = await fetch(`${base}/packs?status=activated`, { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (r.ok) setActive(j.packs ?? []);
  }, [base]);

  const loadSettlements = useCallback(async () => {
    if (!canManage) return;
    const sp = new URLSearchParams();
    if (histFrom) sp.set("from", histFrom);
    if (histTo) sp.set("to", histTo);
    if (histGame.trim()) sp.set("game", histGame.trim());
    if (histPack.trim()) sp.set("packNumber", histPack.trim());
    const r = await fetch(`${base}/settlements?${sp}`, { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (r.ok) setSettlements(j.settlements ?? []);
  }, [base, canManage, histFrom, histGame, histPack, histTo]);

  const refresh = useCallback(async () => {
    setLoading(true);
    await loadActive();
    if (canManage) await loadSettlements();
    setLoading(false);
  }, [canManage, loadActive, loadSettlements]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab === "history" && canManage) void loadSettlements();
  }, [tab, canManage, loadSettlements]);

  async function submitActivate() {
    const r = await fetch(`${base}/activate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        packNumber: actPack.trim(),
        gameName: actGame.trim(),
        ticketCountPerPack: Number(actCount),
        ticketPrice: Number(actPrice),
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Activation failed");
      return;
    }
    setConfirmPack(j.pack);
    showToast("Pack activated");
    setActPack("");
    await loadActive();
  }

  async function submitSettle() {
    const r = await fetch(`${base}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        packId: settlePackId,
        ticketsRemaining: Number(settleRemain),
        actualCashCollected: Number(settleCash),
        notes: settleNotes || undefined,
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Settlement failed");
      return;
    }
    showToast(
      j.settlement?.warnLargeDiscrepancy ? "Settled — review over/short (>$5)" : "Pack settled",
    );
    setSettlePackId("");
    setSettleRemain("0");
    setSettleCash("");
    setSettleNotes("");
    await refresh();
  }

  async function submitInventory() {
    const r = await fetch(`${base}/packs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        gameName: invGame.trim(),
        packNumber: invPack.trim(),
        ticketCountPerPack: Number(invCount),
        ticketPrice: Number(invPrice),
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Save failed");
      return;
    }
    showToast("Pack added to inventory");
    setInvPack("");
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
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
          }}
        >
          {toast}
        </div>
      ) : null}

      <div style={{ marginBottom: 12 }}>
        <Link href={`/store/${encodeURIComponent(storeId)}`} style={{ color: "#2563eb" }}>
          ← Store home
        </Link>
      </div>
      <h1 style={{ marginTop: 0 }}>Lottery — {storeName}</h1>
      <p style={{ opacity: 0.8, maxWidth: 720 }}>
        {canManage ?
          "Activate packs for sale, settle when sold through, and review history."
        : "View active packs. Managers activate and settle packs."}
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {(["active", "activate", "settle", "history"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            disabled={t !== "active" && !canManage}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: tab === t ? "2px solid #2563eb" : "1px solid #ddd",
              background: tab === t ? "#eff6ff" : "#fff",
              cursor: t !== "active" && !canManage ? "not-allowed" : "pointer",
              opacity: t !== "active" && !canManage ? 0.5 : 1,
            }}
          >
            {t === "active" ? "Active packs" : t === "activate" ? "Activate" : t === "settle" ? "Settle" : "History"}
          </button>
        ))}
      </div>

      {confirmPack ? (
        <div
          style={{
            marginBottom: 20,
            padding: 16,
            borderRadius: 10,
            background: "#ecfdf5",
            border: "1px solid #6ee7b7",
          }}
        >
          <strong>Activated</strong> — {String(confirmPack.gameName)} · pack #{String(confirmPack.packNumber)} ·{" "}
          {String(confirmPack.ticketCountPerPack)} tickets @ ${String(confirmPack.ticketPrice)} each
          <button type="button" onClick={() => setConfirmPack(null)} style={{ marginLeft: 12 }}>
            Dismiss
          </button>
        </div>
      ) : null}

      {loading ? <p>Loading…</p> : null}

      {!loading && tab === "active" ? (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: 8 }}>Game</th>
              <th style={{ padding: 8 }}>Pack #</th>
              <th style={{ padding: 8 }}>Price</th>
              <th style={{ padding: 8 }}>Activated</th>
              <th style={{ padding: 8 }}>Days active</th>
            </tr>
          </thead>
          <tbody>
            {active.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 16, opacity: 0.75 }}>
                  No activated packs.
                </td>
              </tr>
            ) : (
              active.map((p) => (
                <tr
                  key={p.id}
                  style={{
                    borderBottom: "1px solid #f0f0f0",
                    background: p.stale ? "#fffbeb" : undefined,
                  }}
                >
                  <td style={{ padding: 8 }}>{p.gameName}</td>
                  <td style={{ padding: 8 }}>{p.packNumber}</td>
                  <td style={{ padding: 8 }}>${p.ticketPrice}</td>
                  <td style={{ padding: 8 }}>{p.activatedAt ? new Date(p.activatedAt).toLocaleString() : "—"}</td>
                  <td style={{ padding: 8 }}>
                    {p.daysActive != null ? p.daysActive : "—"}
                    {p.stale ? <span style={{ color: "#b45309", fontWeight: 700 }}> · Stale (&gt;14d)</span> : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : null}

      {!loading && tab === "activate" && canManage ? (
        <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
          <label>
            Game name
            <input
              value={actGame}
              onChange={(e) => setActGame(e.target.value)}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            />
          </label>
          <label>
            Pack number
            <input
              value={actPack}
              onChange={(e) => setActPack(e.target.value)}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            />
          </label>
          <label>
            Tickets per pack
            <input
              value={actCount}
              onChange={(e) => setActCount(e.target.value)}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            />
          </label>
          <label>
            Ticket price
            <select
              value={actPrice}
              onChange={(e) => setActPrice(e.target.value)}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            >
              {LOTTERY_TICKET_PRICES.map((p) => (
                <option key={p} value={p}>
                  ${p}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void submitActivate()}
            style={{
              padding: "12px 18px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Activate pack
          </button>
        </div>
      ) : null}

      {!loading && tab === "settle" && canManage ? (
        <div style={{ display: "grid", gap: 12, maxWidth: 420 }}>
          <label>
            Pack
            <select
              value={settlePackId}
              onChange={(e) => setSettlePackId(e.target.value)}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            >
              <option value="">— Select activated pack —</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.gameName} · #{p.packNumber} (${p.ticketPrice})
                </option>
              ))}
            </select>
          </label>
          <label>
            Tickets remaining (unsold)
            <input
              value={settleRemain}
              onChange={(e) => setSettleRemain(e.target.value)}
              type="number"
              min={0}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            />
          </label>
          <label>
            Actual cash collected ($)
            <input
              value={settleCash}
              onChange={(e) => setSettleCash(e.target.value)}
              type="number"
              step="0.01"
              min={0}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            />
          </label>
          <label>
            Notes
            <textarea
              value={settleNotes}
              onChange={(e) => setSettleNotes(e.target.value)}
              rows={2}
              style={{ display: "block", width: "100%", padding: 8, marginTop: 4 }}
            />
          </label>
          <button
            type="button"
            onClick={() => void submitSettle()}
            style={{
              padding: "12px 18px",
              background: "#111",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Settle pack
          </button>
        </div>
      ) : null}

      {!loading && tab === "history" && canManage ? (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
            <input type="date" value={histFrom} onChange={(e) => setHistFrom(e.target.value)} />
            <input type="date" value={histTo} onChange={(e) => setHistTo(e.target.value)} />
            <input
              placeholder="Game"
              value={histGame}
              onChange={(e) => setHistGame(e.target.value)}
              style={{ padding: 8 }}
            />
            <input
              placeholder="Pack #"
              value={histPack}
              onChange={(e) => setHistPack(e.target.value)}
              style={{ padding: 8 }}
            />
            <button type="button" onClick={() => void loadSettlements()} style={{ padding: "8px 14px" }}>
              Search
            </button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
                <th style={{ padding: 8 }}>Date</th>
                <th style={{ padding: 8 }}>Game</th>
                <th style={{ padding: 8 }}>Pack</th>
                <th style={{ padding: 8 }}>Sold</th>
                <th style={{ padding: 8 }}>Expected</th>
                <th style={{ padding: 8 }}>Actual</th>
                <th style={{ padding: 8 }}>Over/short</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => (
                <tr
                  key={s.id}
                  style={{
                    borderBottom: "1px solid #f0f0f0",
                    background: s.warnLargeDiscrepancy ? "#fffbeb" : undefined,
                  }}
                >
                  <td style={{ padding: 8 }}>{s.settlementDate}</td>
                  <td style={{ padding: 8 }}>{s.gameName}</td>
                  <td style={{ padding: 8 }}>{s.packNumber}</td>
                  <td style={{ padding: 8 }}>{s.ticketsSoldCount}</td>
                  <td style={{ padding: 8 }}>${s.expectedRevenue}</td>
                  <td style={{ padding: 8 }}>${s.actualCashCollected}</td>
                  <td style={{ padding: 8, fontWeight: s.warnLargeDiscrepancy ? 700 : 400 }}>
                    ${s.overShortAmount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && canManage && tab === "active" ? (
        <section style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 16 }}>Add to inventory (optional)</h2>
          <div style={{ display: "grid", gap: 8, maxWidth: 420 }}>
            <input placeholder="Game" value={invGame} onChange={(e) => setInvGame(e.target.value)} style={{ padding: 8 }} />
            <input placeholder="Pack #" value={invPack} onChange={(e) => setInvPack(e.target.value)} style={{ padding: 8 }} />
            <input value={invCount} onChange={(e) => setInvCount(e.target.value)} style={{ padding: 8 }} />
            <select value={invPrice} onChange={(e) => setInvPrice(e.target.value)} style={{ padding: 8 }}>
              {LOTTERY_TICKET_PRICES.map((p) => (
                <option key={p} value={p}>
                  ${p}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => void submitInventory()} style={{ padding: "10px 16px" }}>
              Save inventory pack
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
