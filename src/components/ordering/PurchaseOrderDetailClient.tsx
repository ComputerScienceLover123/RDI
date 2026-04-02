"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { PurchaseOrderStatus } from "@prisma/client";

type Line = {
  id: string;
  productId: string;
  productName: string;
  upc: string;
  quantityOrdered: number;
  quantityReceived: number;
  outstanding: number;
  unitCost: string;
  lineTotal: string;
};

type PoDetail = {
  id: string;
  status: PurchaseOrderStatus;
  dateOrdered: string;
  dateReceived: string | null;
  totalCost: string;
  notes: string | null;
  vendor: { id: string; companyName: string };
  orderedBy: string;
  lineItems: Line[];
  canManage: boolean;
};

function statusPill(status: PurchaseOrderStatus) {
  const map: Record<PurchaseOrderStatus, { bg: string; color: string }> = {
    draft: { bg: "#f4f4f5", color: "#52525b" },
    submitted: { bg: "#dbeafe", color: "#1d4ed8" },
    received: { bg: "#dcfce7", color: "#15803d" },
    cancelled: { bg: "#fee2e2", color: "#b91c1c" },
  };
  const s = map[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 12px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

export default function PurchaseOrderDetailClient(props: { storeId: string; poId: string }) {
  const { storeId, poId } = props;
  const router = useRouter();
  const [po, setPo] = useState<PoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [receiveBusy, setReceiveBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/purchase-orders/${encodeURIComponent(poId)}`, {
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setPo(data as PoDetail);
      const init: Record<string, string> = {};
      for (const li of (data as PoDetail).lineItems) {
        init[li.id] = li.outstanding > 0 ? String(li.outstanding) : "0";
      }
      setReceiveQty(init);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [storeId, poId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitDraft() {
    if (!po?.canManage) return;
    setSubmitBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/purchase-orders/${encodeURIComponent(poId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "submit" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Submit failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitBusy(false);
    }
  }

  async function confirmReceive() {
    if (!po || po.status !== "submitted" || !po.canManage) return;
    const lines: Array<{ lineItemId: string; quantity: number }> = [];
    for (const li of po.lineItems) {
      const raw = receiveQty[li.id]?.trim() ?? "0";
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setError("Invalid receive quantity");
        return;
      }
      if (n > 0) lines.push({ lineItemId: li.id, quantity: Math.round(n) });
    }
    if (lines.length === 0) {
      setError("Enter at least one quantity received.");
      return;
    }
    setReceiveBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/store/${encodeURIComponent(storeId)}/purchase-orders/${encodeURIComponent(poId)}/receive`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ lines }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Receive failed");
      await load();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Receive failed");
    } finally {
      setReceiveBusy(false);
    }
  }

  if (loading) return <p style={{ padding: 24 }}>Loading…</p>;
  if (error && !po) return <p style={{ padding: 24, color: "crimson" }}>{error}</p>;
  if (!po) return null;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <Link href={`/store/${encodeURIComponent(storeId)}/ordering`} style={{ color: "#2563eb" }}>
        ← Purchase orders
      </Link>

      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
        <h1 style={{ margin: 0, flex: "1 1 auto" }}>PO detail</h1>
        {statusPill(po.status)}
      </div>
      <p style={{ opacity: 0.8 }}>
        <strong>{po.vendor.companyName}</strong> · Ordered {new Date(po.dateOrdered).toLocaleString()} ·{" "}
        {po.orderedBy}
        {po.dateReceived ? ` · Received ${new Date(po.dateReceived).toLocaleString()}` : null}
      </p>
      <p style={{ fontSize: 18 }}>
        Total: <strong>${po.totalCost}</strong>
      </p>
      {po.notes ? (
        <p style={{ background: "#fafafa", padding: 12, borderRadius: 8 }}>
          <strong>Notes:</strong> {po.notes}
        </p>
      ) : null}
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      <h2 style={{ marginTop: 24 }}>Line items</h2>
      <div style={{ overflowX: "auto", border: "1px solid #e5e5e5", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ background: "#f4f4f5", textAlign: "left" }}>
              <th style={{ padding: 10 }}>Product</th>
              <th style={{ padding: 10 }}>UPC</th>
              <th style={{ padding: 10 }}>Ordered</th>
              <th style={{ padding: 10 }}>Received</th>
              <th style={{ padding: 10 }}>Outstanding</th>
              <th style={{ padding: 10 }}>Unit</th>
              {po.status === "submitted" && po.canManage ? <th style={{ padding: 10 }}>Receive now</th> : null}
            </tr>
          </thead>
          <tbody>
            {po.lineItems.map((li) => {
              const raw = receiveQty[li.id] ?? "0";
              const n = Number(raw);
              const planned = Number.isFinite(n) ? n : 0;
              const mismatch =
                po.status === "submitted" &&
                po.canManage &&
                planned > 0 &&
                planned !== li.outstanding;
              return (
                <tr key={li.id} style={{ borderTop: "1px solid #eee", background: mismatch ? "#fffbeb" : undefined }}>
                  <td style={{ padding: 10 }}>{li.productName}</td>
                  <td style={{ padding: 10 }}>
                    <code>{li.upc}</code>
                  </td>
                  <td style={{ padding: 10 }}>{li.quantityOrdered}</td>
                  <td style={{ padding: 10 }}>{li.quantityReceived}</td>
                  <td style={{ padding: 10 }}>{li.outstanding}</td>
                  <td style={{ padding: 10 }}>${li.unitCost}</td>
                  {po.status === "submitted" && po.canManage ? (
                    <td style={{ padding: 10 }}>
                      <input
                        type="number"
                        min={0}
                        value={receiveQty[li.id] ?? ""}
                        onChange={(e) => setReceiveQty((prev) => ({ ...prev, [li.id]: e.target.value }))}
                        style={{
                          width: 88,
                          padding: 8,
                          borderRadius: 6,
                          border: mismatch ? "2px solid #f59e0b" : "1px solid #ccc",
                        }}
                      />
                      {mismatch ? (
                        <div style={{ fontSize: 11, color: "#b45309", marginTop: 4 }}>Differs from outstanding</div>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {po.status === "draft" && po.canManage ? (
        <div style={{ marginTop: 20 }}>
          <button
            type="button"
            onClick={submitDraft}
            disabled={submitBusy}
            style={{
              padding: "12px 20px",
              borderRadius: 8,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontWeight: 600,
              cursor: submitBusy ? "wait" : "pointer",
            }}
          >
            {submitBusy ? "Submitting…" : "Submit purchase order"}
          </button>
        </div>
      ) : null}

      {po.status === "submitted" && po.canManage ? (
        <div style={{ marginTop: 20 }}>
          <p style={{ opacity: 0.85 }}>
            Enter quantities for this delivery. Inventory updates immediately. If not fully received, the PO stays{" "}
            <strong>submitted</strong> until all lines are complete.
          </p>
          <button
            type="button"
            onClick={confirmReceive}
            disabled={receiveBusy}
            style={{
              padding: "12px 20px",
              borderRadius: 8,
              border: "none",
              background: "#15803d",
              color: "#fff",
              fontWeight: 600,
              cursor: receiveBusy ? "wait" : "pointer",
            }}
          >
            {receiveBusy ? "Saving…" : "Confirm receiving"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
