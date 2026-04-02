"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Vendor = { id: string; companyName: string };
type LineRow = {
  inventoryId: string;
  productId: string;
  productName: string;
  upc: string;
  quantityOnHand: number;
  minStockThreshold: number;
  suggestedOrderQty: number;
  unitCost: string;
};

export default function CreatePurchaseOrderClient(props: { storeId: string }) {
  const { storeId } = props;
  const router = useRouter();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorId, setVendorId] = useState("");
  const [lines, setLines] = useState<LineRow[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [loadingLines, setLoadingLines] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/vendors`, { credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed vendors");
        setVendors(data.vendors ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setLoadingVendors(false);
      }
    })();
  }, [storeId]);

  useEffect(() => {
    if (!vendorId) {
      setLines([]);
      setQty({});
      return;
    }
    let cancelled = false;
    setLoadingLines(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/store/${encodeURIComponent(storeId)}/purchase-orders/vendor-lines?vendorId=${encodeURIComponent(vendorId)}`,
          { credentials: "same-origin" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load products");
        if (cancelled) return;
        const ls: LineRow[] = data.lines ?? [];
        setLines(ls);
        const init: Record<string, string> = {};
        for (const l of ls) init[l.productId] = String(l.suggestedOrderQty > 0 ? l.suggestedOrderQty : 0);
        setQty(init);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoadingLines(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId, vendorId]);

  async function submit(status: "draft" | "submitted") {
    if (!vendorId) {
      setError("Select a vendor");
      return;
    }
    const bodyLines: Array<{ productId: string; quantityOrdered: number }> = [];
    for (const l of lines) {
      const raw = qty[l.productId]?.trim() ?? "0";
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        setError(`Invalid quantity for ${l.productName}`);
        return;
      }
      if (n < 1) continue;
      bodyLines.push({ productId: l.productId, quantityOrdered: Math.round(n) });
    }
    if (bodyLines.length === 0) {
      setError("Enter a quantity of at least 1 for one product.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/purchase-orders`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ vendorId, notes, lines: bodyLines, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");
      router.push(`/store/${encodeURIComponent(storeId)}/ordering/${encodeURIComponent(data.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <Link href={`/store/${encodeURIComponent(storeId)}/ordering`} style={{ color: "#2563eb" }}>
        ← Purchase orders
      </Link>
      <h1 style={{ marginTop: 16 }}>New purchase order</h1>

      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}

      <label style={{ display: "grid", gap: 6, marginBottom: 16, maxWidth: 400 }}>
        <span style={{ fontWeight: 600 }}>Vendor</span>
        <select
          value={vendorId}
          onChange={(e) => setVendorId(e.target.value)}
          disabled={loadingVendors}
          style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
        >
          <option value="">Select vendor…</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.companyName}
            </option>
          ))}
        </select>
      </label>

      {loadingLines ? <p>Loading products…</p> : null}

      {lines.length > 0 ? (
        <>
          <div style={{ overflowX: "auto", border: "1px solid #e5e5e5", borderRadius: 8, marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f4f4f5", textAlign: "left" }}>
                  <th style={{ padding: 10 }}>Product</th>
                  <th style={{ padding: 10 }}>UPC</th>
                  <th style={{ padding: 10 }}>On hand</th>
                  <th style={{ padding: 10 }}>Min</th>
                  <th style={{ padding: 10 }}>Suggested</th>
                  <th style={{ padding: 10 }}>Order qty</th>
                  <th style={{ padding: 10 }}>Unit cost</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.productId} style={{ borderTop: "1px solid #eee" }}>
                    <td style={{ padding: 10 }}>{l.productName}</td>
                    <td style={{ padding: 10 }}>
                      <code>{l.upc}</code>
                    </td>
                    <td style={{ padding: 10 }}>{l.quantityOnHand}</td>
                    <td style={{ padding: 10 }}>{l.minStockThreshold}</td>
                    <td style={{ padding: 10 }}>{l.suggestedOrderQty}</td>
                    <td style={{ padding: 10 }}>
                      <input
                        type="number"
                        min={0}
                        value={qty[l.productId] ?? ""}
                        onChange={(e) => setQty((prev) => ({ ...prev, [l.productId]: e.target.value }))}
                        style={{ width: 88, padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
                      />
                    </td>
                    <td style={{ padding: 10 }}>${l.unitCost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label style={{ display: "grid", gap: 6, marginBottom: 16 }}>
            <span style={{ fontWeight: 600 }}>Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ padding: 10, borderRadius: 8, border: "1px solid #ccc" }}
            />
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={submitting}
              onClick={() => submit("submitted")}
              style={{
                padding: "12px 20px",
                borderRadius: 8,
                border: "none",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 600,
                cursor: submitting ? "wait" : "pointer",
              }}
            >
              {submitting ? "Saving…" : "Submit order"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => submit("draft")}
              style={{
                padding: "12px 20px",
                borderRadius: 8,
                border: "1px solid #ccc",
                background: "#fff",
                fontWeight: 600,
                cursor: submitting ? "wait" : "pointer",
              }}
            >
              Save draft
            </button>
          </div>
        </>
      ) : vendorId && !loadingLines ? (
        <p style={{ opacity: 0.75 }}>No products from this vendor are stocked at this store.</p>
      ) : null}
    </div>
  );
}
