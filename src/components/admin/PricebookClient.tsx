"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type ProductRow = {
  id: string;
  name: string;
  upc: string;
  category: string;
  brand: string | null;
  vendorId: string;
  vendorName: string;
  costPrice: string;
  retailPrice: string;
  marginPct: number | null;
  taxEligible: boolean;
  active: boolean;
  overrideStoreCount: number;
};

type SortKey =
  | "name"
  | "upc"
  | "category"
  | "brand"
  | "vendorName"
  | "costPrice"
  | "retailPrice"
  | "marginPct"
  | "taxEligible"
  | "active"
  | "overrideStoreCount";

const SORT_KEYS: SortKey[] = [
  "name",
  "upc",
  "category",
  "brand",
  "vendorName",
  "costPrice",
  "retailPrice",
  "marginPct",
  "taxEligible",
  "active",
  "overrideStoreCount",
];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function PricebookClient() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [vendorId, setVendorId] = useState("all");
  const [active, setActive] = useState("all");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [vendors, setVendors] = useState<{ id: string; companyName: string }[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState<"setRetail" | "markupPct" | "adjustRetailPct">("setRetail");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkPreview, setBulkPreview] = useState<
    { productId: string; name: string; oldRetail: string; newRetail: string }[] | null
  >(null);

  const [newOpen, setNewOpen] = useState(false);
  const [newForm, setNewForm] = useState({
    name: "",
    upc: "",
    category: "other",
    brand: "",
    vendorId: "",
    costPrice: "",
    retailPrice: "",
    taxEligible: true,
  });

  const qDebounced = useDebounced(q, 300);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (qDebounced.trim()) p.set("q", qDebounced.trim());
    if (category !== "all") p.set("category", category);
    if (vendorId !== "all") p.set("vendorId", vendorId);
    if (active !== "all") p.set("active", active);
    p.set("sortBy", sortBy);
    p.set("sortOrder", sortOrder);
    return p.toString();
  }, [qDebounced, category, vendorId, active, sortBy, sortOrder]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/pricebook?${queryString}`, { credentials: "include" });
    if (res.ok) {
      const j = await res.json();
      setProducts(j.products ?? []);
      setVendors(j.vendors ?? []);
      setCategories(j.categories ?? []);
    }
    setLoading(false);
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  async function patchProduct(id: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/admin/pricebook/products/${encodeURIComponent(id)}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      showToast("Saved");
      void load();
    } else {
      const e = await res.json().catch(() => ({}));
      showToast(e.error ?? "Save failed");
    }
  }

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortOrder("asc");
    }
  }

  function toggleAll() {
    if (selected.size === products.length) setSelected(new Set());
    else setSelected(new Set(products.map((p) => p.id)));
  }

  async function runBulkPreview() {
    const ids = [...selected];
    if (ids.length === 0 || bulkValue === "") return;
    const res = await fetch("/api/admin/pricebook/bulk-preview", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productIds: ids,
        mode: bulkMode,
        value: Number(bulkValue),
      }),
    });
    if (res.ok) {
      const j = await res.json();
      setBulkPreview(j.previews ?? []);
    }
  }

  async function runBulkApply() {
    const ids = [...selected];
    if (ids.length === 0 || bulkValue === "") return;
    const res = await fetch("/api/admin/pricebook/bulk-apply", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productIds: ids,
        mode: bulkMode,
        value: Number(bulkValue),
      }),
    });
    if (res.ok) {
      showToast("Bulk update applied");
      setBulkOpen(false);
      setBulkPreview(null);
      setSelected(new Set());
      void load();
    }
  }

  async function createProduct() {
    const res = await fetch("/api/admin/pricebook/products", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: newForm.name,
        upc: newForm.upc,
        category: newForm.category,
        brand: newForm.brand || null,
        vendorId: newForm.vendorId,
        costPrice: newForm.costPrice,
        retailPrice: newForm.retailPrice,
        taxEligible: newForm.taxEligible,
      }),
    });
    if (res.ok) {
      showToast("Product created");
      setNewOpen(false);
      setNewForm({
        name: "",
        upc: "",
        category: "other",
        brand: "",
        vendorId: "",
        costPrice: "",
        retailPrice: "",
        taxEligible: true,
      });
      void load();
    } else {
      const e = await res.json().catch(() => ({}));
      showToast(e.error ?? "Create failed");
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
      {toast ? (
        <div
          style={{
            position: "fixed",
            top: 72,
            right: 24,
            background: "#111827",
            color: "#fff",
            padding: "10px 16px",
            borderRadius: 8,
            zIndex: 200,
            fontSize: 14,
          }}
        >
          {toast}
        </div>
      ) : null}

      <p style={{ marginBottom: 16 }}>
        <Link href="/store" style={{ color: "#2563eb" }}>
          ← Stores
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Pricebook</h1>
      <p style={{ opacity: 0.85, maxWidth: 720 }}>
        Master catalog for all stores. Inline edits save immediately. Store overrides are managed on each product&apos;s
        detail page.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <input
          placeholder="Search name, UPC, brand, vendor…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ padding: 8, minWidth: 240 }}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: 8 }}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} style={{ padding: 8 }}>
          <option value="all">All vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.companyName}
            </option>
          ))}
        </select>
        <select value={active} onChange={(e) => setActive(e.target.value)} style={{ padding: 8 }}>
          <option value="all">Active + inactive</option>
          <option value="true">Active only</option>
          <option value="false">Inactive only</option>
        </select>
        <button type="button" onClick={() => setNewOpen(true)}>
          New product
        </button>
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() => {
            setBulkOpen(true);
            setBulkPreview(null);
          }}
        >
          Bulk price update ({selected.size})
        </button>
      </div>

      {loading ? <p>Loading…</p> : null}

      {!loading ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th style={{ padding: 8 }}>
                  <input type="checkbox" checked={products.length > 0 && selected.size === products.length} onChange={toggleAll} />
                </th>
                {SORT_KEYS.map((k) => (
                  <th key={k} style={{ padding: 8, cursor: "pointer", whiteSpace: "nowrap" }} onClick={() => toggleSort(k)}>
                    {k === "name"
                      ? "Product"
                      : k === "vendorName"
                        ? "Vendor"
                        : k === "marginPct"
                          ? "Margin %"
                          : k === "taxEligible"
                            ? "Tax"
                            : k === "active"
                              ? "Active"
                              : k === "overrideStoreCount"
                                ? "Overrides"
                                : k}
                    {sortBy === k ? (sortOrder === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                ))}
                <th style={{ padding: 8 }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #eee", opacity: p.active ? 1 : 0.65 }}>
                  <td style={{ padding: 6 }}>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => {
                        const n = new Set(selected);
                        if (n.has(p.id)) n.delete(p.id);
                        else n.add(p.id);
                        setSelected(n);
                      }}
                    />
                  </td>
                  <td style={{ padding: 6 }}>
                    <Link href={`/admin/pricebook/${encodeURIComponent(p.id)}`} style={{ color: "#2563eb", fontWeight: 600 }}>
                      {p.name}
                    </Link>
                  </td>
                  <td style={{ padding: 6 }}>
                    <code style={{ fontSize: 11 }}>{p.upc}</code>
                  </td>
                  <td style={{ padding: 6 }}>{p.category}</td>
                  <td style={{ padding: 6 }}>{p.brand ?? "—"}</td>
                  <td style={{ padding: 6 }}>{p.vendorName}</td>
                  <td style={{ padding: 6 }}>
                    <InlineMoney
                      value={p.costPrice}
                      onSave={(v) => void patchProduct(p.id, { costPrice: v })}
                    />
                  </td>
                  <td style={{ padding: 6 }}>
                    <InlineMoney
                      value={p.retailPrice}
                      onSave={(v) => void patchProduct(p.id, { retailPrice: v })}
                    />
                  </td>
                  <td style={{ padding: 6 }}>{p.marginPct != null ? `${p.marginPct.toFixed(1)}%` : "—"}</td>
                  <td style={{ padding: 6 }}>
                    <input
                      type="checkbox"
                      checked={p.taxEligible}
                      onChange={(e) => void patchProduct(p.id, { taxEligible: e.target.checked })}
                    />
                  </td>
                  <td style={{ padding: 6 }}>
                    <input
                      type="checkbox"
                      checked={p.active}
                      onChange={(e) => void patchProduct(p.id, { active: e.target.checked })}
                    />
                  </td>
                  <td style={{ padding: 6 }}>{p.overrideStoreCount}</td>
                  <td style={{ padding: 6 }}>
                    <Link href={`/admin/pricebook/${encodeURIComponent(p.id)}`} style={{ fontSize: 12 }}>
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {newOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
          onClick={() => setNewOpen(false)}
        >
          <div
            style={{ background: "#fff", padding: 20, borderRadius: 10, maxWidth: 440, width: "100%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>New product</h3>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 4 }}>
                Name
                <input value={newForm.name} onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                UPC
                <input value={newForm.upc} onChange={(e) => setNewForm((f) => ({ ...f, upc: e.target.value }))} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                Category
                <select
                  value={newForm.category}
                  onChange={(e) => setNewForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                Brand
                <input value={newForm.brand} onChange={(e) => setNewForm((f) => ({ ...f, brand: e.target.value }))} />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                Vendor
                <select
                  value={newForm.vendorId}
                  onChange={(e) => setNewForm((f) => ({ ...f, vendorId: e.target.value }))}
                >
                  <option value="">Select…</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.companyName}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                Cost price
                <input
                  value={newForm.costPrice}
                  onChange={(e) => setNewForm((f) => ({ ...f, costPrice: e.target.value }))}
                />
              </label>
              <label style={{ display: "grid", gap: 4 }}>
                Retail price
                <input
                  value={newForm.retailPrice}
                  onChange={(e) => setNewForm((f) => ({ ...f, retailPrice: e.target.value }))}
                />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={newForm.taxEligible}
                  onChange={(e) => setNewForm((f) => ({ ...f, taxEligible: e.target.checked }))}
                />
                Tax eligible
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button type="button" onClick={() => void createProduct()}>
                Create
              </button>
              <button type="button" onClick={() => setNewOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {bulkOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            padding: 16,
          }}
          onClick={() => setBulkOpen(false)}
        >
          <div
            style={{ background: "#fff", padding: 20, borderRadius: 10, maxWidth: 720, width: "100%", maxHeight: "90vh", overflow: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Bulk retail update</h3>
            <p style={{ fontSize: 14, opacity: 0.85 }}>Selected: {selected.size} product(s)</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <select value={bulkMode} onChange={(e) => setBulkMode(e.target.value as typeof bulkMode)}>
                <option value="setRetail">Set retail to exact $</option>
                <option value="markupPct">Markup % over cost</option>
                <option value="adjustRetailPct">Adjust current retail by %</option>
              </select>
              <input
                placeholder={bulkMode === "setRetail" ? "e.g. 4.99" : "e.g. 25 or -10"}
                value={bulkValue}
                onChange={(e) => setBulkValue(e.target.value)}
                style={{ width: 120 }}
              />
              <button type="button" onClick={() => void runBulkPreview()}>
                Preview
              </button>
            </div>
            {bulkPreview ? (
              <>
                <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #ccc" }}>
                      <th style={{ textAlign: "left", padding: 6 }}>Product</th>
                      <th style={{ textAlign: "left", padding: 6 }}>Old retail</th>
                      <th style={{ textAlign: "left", padding: 6 }}>New retail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPreview.map((r) => (
                      <tr key={r.productId} style={{ borderBottom: "1px solid #eee" }}>
                        <td style={{ padding: 6 }}>{r.name}</td>
                        <td style={{ padding: 6 }}>${r.oldRetail}</td>
                        <td style={{ padding: 6 }}>${r.newRetail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                  <button type="button" onClick={() => void runBulkApply()}>
                    Confirm apply
                  </button>
                  <button type="button" onClick={() => setBulkPreview(null)}>
                    Clear preview
                  </button>
                </div>
              </>
            ) : null}
            <button type="button" style={{ marginTop: 12 }} onClick={() => setBulkOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function InlineMoney({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <input
      style={{ width: 88, padding: 4, fontSize: 13 }}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (local.trim() !== value) onSave(local.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
