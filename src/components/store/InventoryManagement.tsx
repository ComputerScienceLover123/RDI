"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { UserRole } from "@prisma/client";
import { getStockLevel, stockLevelStyles } from "@/lib/store/stockStatus";

type InvRow = {
  inventoryId: string;
  productId: string;
  productName: string;
  upc: string;
  category: string;
  vendorName: string;
  vendorId: string;
  costPrice: string;
  retailPrice: string;
  quantityOnHand: number;
  minStockThreshold: number;
  lastCountedAt: string | null;
};

type SortKey =
  | "productName"
  | "upc"
  | "category"
  | "vendorName"
  | "costPrice"
  | "retailPrice"
  | "quantityOnHand"
  | "minStockThreshold";

const SORT_KEYS: SortKey[] = [
  "productName",
  "upc",
  "category",
  "vendorName",
  "costPrice",
  "retailPrice",
  "quantityOnHand",
  "minStockThreshold",
];

const LABELS: Record<SortKey, string> = {
  productName: "Product",
  upc: "UPC",
  category: "Category",
  vendorName: "Vendor",
  costPrice: "Cost",
  retailPrice: "Retail",
  quantityOnHand: "Qty",
  minStockThreshold: "Min",
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function InventoryManagement(props: {
  storeId: string;
  userRole: UserRole;
  canAudit: boolean;
}) {
  const { storeId, canAudit } = props;

  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [vendorId, setVendorId] = useState<string>("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("productName");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const [rows, setRows] = useState<InvRow[]>([]);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [vendors, setVendors] = useState<Array<{ id: string; companyName: string }>>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [detail, setDetail] = useState<unknown>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [auditMode, setAuditMode] = useState(false);
  const [auditCategory, setAuditCategory] = useState<string>("all");
  const [auditCounts, setAuditCounts] = useState<Record<string, string>>({});
  const [auditSubmitting, setAuditSubmitting] = useState(false);
  const [auditInventoryRows, setAuditInventoryRows] = useState<InvRow[]>([]);
  const [auditInventoryLoading, setAuditInventoryLoading] = useState(false);

  const [qInput, setQInput] = useState("");
  const qDebounced = useDebounced(qInput, 350);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (qDebounced.trim()) p.set("q", qDebounced.trim());
    if (category !== "all") p.set("category", category);
    if (vendorId !== "all") p.set("vendorId", vendorId);
    if (lowStockOnly) p.set("lowStockOnly", "1");
    p.set("sortBy", sortBy);
    p.set("sortOrder", sortOrder);
    return p.toString();
  }, [qDebounced, category, vendorId, lowStockOnly, sortBy, sortOrder]);

  useEffect(() => {
    if (!auditMode) return;
    let cancelled = false;
    setAuditInventoryLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/store/${encodeURIComponent(storeId)}/inventory?sortBy=productName&sortOrder=asc`,
          { credentials: "same-origin" }
        );
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setAuditInventoryRows(data.rows ?? []);
          setCategories(data.categories ?? []);
        }
      } finally {
        if (!cancelled) setAuditInventoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auditMode, storeId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/inventory?${queryString}`, {
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load inventory");
      setRows(data.rows ?? []);
      setLowStockCount(Number(data.lowStockCount ?? 0));
      setVendors(data.vendors ?? []);
      setCategories(data.categories ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [storeId, queryString]);

  useEffect(() => {
    load();
  }, [load]);

  const onHeaderClick = (key: SortKey) => {
    if (sortBy === key) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortOrder("asc");
    }
  };

  const openDetail = async (productId: string) => {
    setDetailProductId(productId);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(
        `/api/store/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/detail`,
        { credentials: "same-origin" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load detail");
      setDetail(data);
    } catch (e) {
      setDetail({ error: e instanceof Error ? e.message : "Error" });
    } finally {
      setDetailLoading(false);
    }
  };

  const auditRows = useMemo(() => {
    if (!auditMode) return [];
    let list = auditInventoryRows;
    if (auditCategory !== "all") list = list.filter((r) => r.category === auditCategory);
    return list;
  }, [auditMode, auditInventoryRows, auditCategory]);

  const submitAudit = async () => {
    const entries: Array<{ productId: string; countedQuantity: number }> = [];
    for (const r of auditRows) {
      const raw = auditCounts[r.productId]?.trim();
      if (raw === undefined || raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        setError(`Invalid count for ${r.productName}`);
        return;
      }
      entries.push({ productId: r.productId, countedQuantity: Math.round(n) });
    }
    if (entries.length === 0) {
      setError("Enter at least one physical count.");
      return;
    }
    setAuditSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/audit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ entries }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Audit failed");
      setAuditCounts({});
      setAuditMode(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setAuditSubmitting(false);
    }
  };

  return (
    <section>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0, flex: "1 1 auto" }}>Inventory</h2>
        {canAudit ? (
          <button
            type="button"
            onClick={() => {
              setAuditMode((a) => !a);
              setError(null);
              setAuditCounts({});
              setAuditCategory("all");
            }}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: auditMode ? "#111827" : "#fff",
              color: auditMode ? "#fff" : "#111",
              cursor: "pointer",
            }}
          >
            {auditMode ? "Exit audit mode" : "Audit mode"}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => setLowStockOnly((v) => !v)}
        style={{
          width: "100%",
          textAlign: "left",
          padding: 14,
          marginBottom: 16,
          borderRadius: 10,
          border: lowStockOnly ? "2px solid #b42318" : "1px solid #e5e5e5",
          background: lowStockOnly ? "#fff5f5" : "#fafafa",
          cursor: "pointer",
        }}
      >
        <strong style={{ color: "#b42318" }}>{lowStockCount}</strong>
        <span style={{ marginLeft: 8 }}>
          {lowStockCount === 1 ? "product is" : "products are"} at or below minimum stock
        </span>
        <span style={{ marginLeft: 8, opacity: 0.75, fontSize: 13 }}>
          {lowStockOnly ? "(showing low-stock only — click to clear)" : "(click to filter)"}
        </span>
      </button>

      {!auditMode ? (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
              gap: 10,
              marginBottom: 12,
            }}
          >
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Search name or UPC</span>
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search…"
                style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              >
                <option value="all">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Vendor</span>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
              >
                <option value="all">All vendors</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.companyName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error ? (
            <p style={{ color: "crimson" }}>{error}</p>
          ) : loading ? (
            <p>Loading…</p>
          ) : (
            <div style={{ overflowX: "auto", border: "1px solid #e5e5e5", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ background: "#f4f4f5", textAlign: "left" }}>
                    <th style={{ padding: 10, width: 72 }}>Stock</th>
                    {SORT_KEYS.map((k) => (
                      <th key={k} style={{ padding: 10, whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick={() => onHeaderClick(k)}
                          style={{
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontWeight: 600,
                            padding: 0,
                            color: sortBy === k ? "#2563eb" : "inherit",
                          }}
                        >
                          {LABELS[k]}
                          {sortBy === k ? (sortOrder === "asc" ? " ▲" : " ▼") : ""}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const level = getStockLevel(r.quantityOnHand, r.minStockThreshold);
                    const st = stockLevelStyles(level);
                    return (
                      <tr
                        key={r.inventoryId}
                        onClick={() => openDetail(r.productId)}
                        style={{
                          borderTop: "1px solid #eee",
                          cursor: "pointer",
                          background: st.background,
                        }}
                      >
                        <td style={{ padding: 10 }}>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "2px 8px",
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 600,
                              color: st.color,
                              background: "#fff",
                              border: `1px solid ${st.color}`,
                            }}
                          >
                            {st.label}
                          </span>
                        </td>
                        <td style={{ padding: 10 }}>{r.productName}</td>
                        <td style={{ padding: 10 }}>
                          <code>{r.upc}</code>
                        </td>
                        <td style={{ padding: 10 }}>{r.category}</td>
                        <td style={{ padding: 10 }}>{r.vendorName}</td>
                        <td style={{ padding: 10 }}>${r.costPrice}</td>
                        <td style={{ padding: 10 }}>${r.retailPrice}</td>
                        <td style={{ padding: 10, fontWeight: 600 }}>{r.quantityOnHand}</td>
                        <td style={{ padding: 10 }}>{r.minStockThreshold}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <div>
          <p style={{ opacity: 0.85, marginTop: 0 }}>
            Enter physical counts for the products you counted. Only rows with a value are submitted. Managers and admins
            only.
          </p>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Browse by category</span>
              <select
                value={auditCategory}
                onChange={(e) => setAuditCategory(e.target.value)}
                style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc", minWidth: 200 }}
              >
                <option value="all">All products</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
          {auditInventoryLoading ? <p>Loading products for audit…</p> : null}
          <div style={{ overflowX: "auto", border: "1px solid #e5e5e5", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f4f4f5", textAlign: "left" }}>
                  <th style={{ padding: 10 }}>Product</th>
                  <th style={{ padding: 10 }}>UPC</th>
                  <th style={{ padding: 10 }}>System qty</th>
                  <th style={{ padding: 10 }}>Physical count</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.map((r) => (
                  <tr key={r.inventoryId} style={{ borderTop: "1px solid #eee" }}>
                    <td style={{ padding: 10 }}>{r.productName}</td>
                    <td style={{ padding: 10 }}>
                      <code>{r.upc}</code>
                    </td>
                    <td style={{ padding: 10, fontWeight: 600 }}>{r.quantityOnHand}</td>
                    <td style={{ padding: 10 }}>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={auditCounts[r.productId] ?? ""}
                        onChange={(e) =>
                          setAuditCounts((prev) => ({ ...prev, [r.productId]: e.target.value }))
                        }
                        style={{ width: 120, padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
                        placeholder="Count"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16 }}>
            <button
              type="button"
              onClick={submitAudit}
              disabled={auditSubmitting}
              style={{
                padding: "10px 18px",
                borderRadius: 8,
                border: "none",
                background: "#2563eb",
                color: "#fff",
                cursor: auditSubmitting ? "wait" : "pointer",
              }}
            >
              {auditSubmitting ? "Saving…" : "Submit audit"}
            </button>
          </div>
        </div>
      )}

      {detailProductId ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 50,
            display: "flex",
            justifyContent: "flex-end",
          }}
          onClick={() => setDetailProductId(null)}
        >
          <div
            style={{
              width: "min(480px, 100%)",
              height: "100%",
              background: "#fff",
              overflow: "auto",
              padding: 20,
              boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <h3 style={{ marginTop: 0 }}>Product detail</h3>
              <button
                type="button"
                onClick={() => setDetailProductId(null)}
                style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
              >
                ×
              </button>
            </div>
            {detailLoading ? (
              <p>Loading…</p>
            ) : detail && typeof detail === "object" && detail !== null && "error" in detail ? (
              <p style={{ color: "crimson" }}>{String((detail as { error: string }).error)}</p>
            ) : detail && typeof detail === "object" ? (
              <DetailBody data={detail as DetailPayload} />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

type DetailPayload = {
  product: {
    id: string;
    upc: string;
    name: string;
    description: string | null;
    category: string;
    brand: string | null;
    taxEligible: boolean;
    active: boolean;
    costPrice: string;
    retailPrice: string;
    vendor: { companyName: string; contactEmail: string; paymentTerms: string };
  };
  inventory: { quantityOnHand: number; minStockThreshold: number; lastCountedAt: string | null };
  recentTransactions: Array<{
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    transaction: {
      transactionAt: string;
      type: string;
      terminalId: string;
      verifoneReferenceId: string | null;
      paymentMethod: string;
      cashier: string;
    };
  }>;
  recentPurchaseOrders: Array<{
    quantityOrdered: number;
    quantityReceived: number;
    unitCost: string;
    purchaseOrder: {
      dateOrdered: string;
      status: string;
      vendorName: string;
    };
  }>;
  lastAudit: null | {
    auditedAt: string;
    systemQuantity: number;
    countedQuantity: number;
    discrepancyAmount: number;
    employee: string;
    notes: string | null;
  };
};

function DetailBody({ data }: { data: DetailPayload }) {
  return (
    <div style={{ display: "grid", gap: 16, fontSize: 14 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{data.product.name}</div>
        <div style={{ opacity: 0.8 }}>
          <code>{data.product.upc}</code> · {data.product.category}
        </div>
        {data.product.description ? <p style={{ margin: "8px 0 0" }}>{data.product.description}</p> : null}
        <p style={{ margin: "8px 0 0" }}>
          Vendor: <strong>{data.product.vendor.companyName}</strong>
        </p>
        <p style={{ margin: "4px 0 0" }}>
          Cost ${data.product.costPrice} · Retail ${data.product.retailPrice}
        </p>
        <p style={{ margin: "4px 0 0" }}>
          On hand: <strong>{data.inventory.quantityOnHand}</strong> (min {data.inventory.minStockThreshold})
        </p>
      </div>

      <div>
        <h4 style={{ margin: "0 0 8px" }}>Recent transactions (this store)</h4>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {data.recentTransactions.length === 0 ? (
            <li style={{ opacity: 0.7 }}>None</li>
          ) : (
            data.recentTransactions.slice(0, 10).map((t, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {new Date(t.transaction.transactionAt).toLocaleString()} · {t.transaction.type} · qty {t.quantity} · $
                {t.lineTotal} · {t.transaction.cashier}
              </li>
            ))
          )}
        </ul>
      </div>

      <div>
        <h4 style={{ margin: "0 0 8px" }}>Recent purchase orders</h4>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {data.recentPurchaseOrders.length === 0 ? (
            <li style={{ opacity: 0.7 }}>None</li>
          ) : (
            data.recentPurchaseOrders.map((p, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                {new Date(p.purchaseOrder.dateOrdered).toLocaleDateString()} · {p.purchaseOrder.status} · ordered{" "}
                {p.quantityOrdered} / recv {p.quantityReceived} · {p.purchaseOrder.vendorName}
              </li>
            ))
          )}
        </ul>
      </div>

      <div>
        <h4 style={{ margin: "0 0 8px" }}>Last audit</h4>
        {data.lastAudit ? (
          <p style={{ margin: 0 }}>
            {new Date(data.lastAudit.auditedAt).toLocaleString()} — counted {data.lastAudit.countedQuantity} (system{" "}
            {data.lastAudit.systemQuantity}, Δ {data.lastAudit.discrepancyAmount}) by {data.lastAudit.employee}
          </p>
        ) : (
          <p style={{ margin: 0, opacity: 0.7 }}>No audits recorded yet.</p>
        )}
      </div>
    </div>
  );
}
