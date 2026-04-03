"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type OverrideRow = { storeId: string; storeName: string; retailPrice: string; updatedAt: string };
type ChangelogRow = {
  id: string;
  fieldKey: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  changedBy: string;
};

type ProductPayload = {
  id: string;
  name: string;
  upc: string;
  description: string | null;
  category: string;
  brand: string | null;
  vendorId: string;
  vendorName: string;
  costPrice: string;
  retailPrice: string;
  taxEligible: boolean;
  active: boolean;
  ageRestricted: boolean;
  minimumAge: number;
};

export default function PricebookProductDetailClient(props: { productId: string }) {
  const { productId } = props;
  const [product, setProduct] = useState<ProductPayload | null>(null);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [changelog, setChangelog] = useState<ChangelogRow[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [storeId, setStoreId] = useState("");
  const [overridePrice, setOverridePrice] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/pricebook/products/${encodeURIComponent(productId)}`, {
      credentials: "include",
    });
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const j = await res.json();
    setProduct(j.product);
    setOverrides(j.overrides ?? []);
    setChangelog(j.changelog ?? []);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void fetch("/api/admin/pricebook/stores", { credentials: "include" })
      .then((r) => r.json())
      .then((j) => {
        if (j.stores) setStores(j.stores);
      });
  }, []);

  async function addOverride() {
    if (!storeId || !overridePrice.trim()) return;
    const res = await fetch(`/api/admin/pricebook/products/${encodeURIComponent(productId)}/overrides`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storeId, retailPrice: overridePrice.trim() }),
    });
    if (res.ok) {
      setToast("Override saved");
      setOverridePrice("");
      setStoreId("");
      void load();
    } else {
      const e = await res.json().catch(() => ({}));
      setToast(e.error ?? "Save failed");
    }
    setTimeout(() => setToast(null), 2500);
  }

  async function removeOverride(sid: string) {
    const res = await fetch(
      `/api/admin/pricebook/products/${encodeURIComponent(productId)}/overrides?storeId=${encodeURIComponent(sid)}`,
      { method: "DELETE", credentials: "include" }
    );
    if (res.ok) {
      setToast("Override removed");
      void load();
    }
    setTimeout(() => setToast(null), 2500);
  }

  if (loading) return <main style={{ padding: 24 }}>Loading…</main>;
  if (!product) return <main style={{ padding: 24 }}>Product not found.</main>;

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
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
      <p>
        <Link href="/admin/pricebook" style={{ color: "#2563eb" }}>
          ← Pricebook
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>{product.name}</h1>
      <p style={{ opacity: 0.85 }}>
        <code>{product.upc}</code> · {product.category} · {product.active ? "Active" : "Inactive"}
      </p>
      <p>
        Vendor: <strong>{product.vendorName}</strong> · Chain retail ${product.retailPrice} · Cost ${product.costPrice}
      </p>
      <p style={{ fontSize: 14 }}>
        Age compliance:{" "}
        {product.ageRestricted ? (
          <>
            <strong>Restricted</strong> — minimum age {product.minimumAge}
          </>
        ) : (
          "Not age-restricted"
        )}{" "}
        <span style={{ opacity: 0.75 }}>
          (edit on the <Link href="/admin/pricebook">pricebook</Link> list)
        </span>
      </p>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 18 }}>Store price overrides</h2>
        <p style={{ opacity: 0.8, fontSize: 14 }}>
          When set, this retail price is used at that store instead of the chain price (${product.retailPrice}).
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            style={{ padding: 8, minWidth: 200 }}
          >
            <option value="">Select store…</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Override retail $"
            value={overridePrice}
            onChange={(e) => setOverridePrice(e.target.value)}
            style={{ padding: 8, width: 140 }}
          />
          <button type="button" onClick={() => void addOverride()}>
            Save override
          </button>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: 8 }}>Store</th>
              <th style={{ padding: 8 }}>Override retail</th>
              <th style={{ padding: 8 }} />
            </tr>
          </thead>
          <tbody>
            {overrides.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: 8, opacity: 0.7 }}>
                  No overrides.
                </td>
              </tr>
            ) : (
              overrides.map((o) => (
                <tr key={o.storeId} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>{o.storeName}</td>
                  <td style={{ padding: 8 }}>${o.retailPrice}</td>
                  <td style={{ padding: 8 }}>
                    <button type="button" onClick={() => void removeOverride(o.storeId)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 28 }}>
        <h2 style={{ fontSize: 18 }}>Change log</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
                <th style={{ padding: 8 }}>Time</th>
                <th style={{ padding: 8 }}>Field</th>
                <th style={{ padding: 8 }}>Old</th>
                <th style={{ padding: 8 }}>New</th>
                <th style={{ padding: 8 }}>By</th>
              </tr>
            </thead>
            <tbody>
              {changelog.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid #eee", verticalAlign: "top" }}>
                  <td style={{ padding: 8, whiteSpace: "nowrap" }}>{new Date(c.createdAt).toLocaleString()}</td>
                  <td style={{ padding: 8 }}>
                    <code>{c.fieldKey}</code>
                  </td>
                  <td style={{ padding: 8 }}>{c.oldValue ?? "—"}</td>
                  <td style={{ padding: 8 }}>{c.newValue ?? "—"}</td>
                  <td style={{ padding: 8 }}>{c.changedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
