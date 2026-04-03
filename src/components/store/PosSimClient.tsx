"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type ProductOpt = {
  id: string;
  name: string;
  upc: string;
  retailPrice: string;
  ageRestricted: boolean;
  minimumAge: number;
};

type CartLine = { productId: string; name: string; quantity: number; unitPrice: string; ageRestricted: boolean; minimumAge: number };

type VerificationDraft = {
  method: "visual_check" | "id_scanned" | "id_manual_entry";
  customerDob: string;
  idType: "drivers_license" | "state_id" | "passport" | "military_id" | "";
  expiredId: boolean;
  noIdPresent: boolean;
};

const emptyVerification = (): VerificationDraft => ({
  method: "id_manual_entry",
  customerDob: "",
  idType: "drivers_license",
  expiredId: false,
  noIdPresent: false,
});

export default function PosSimClient({ storeId }: { storeId: string }) {
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "credit" | "debit" | "mobile">("cash");
  const [verifications, setVerifications] = useState<VerificationDraft[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadProducts = useCallback(async () => {
    const res = await fetch(
      `/api/store/${encodeURIComponent(storeId)}/compliance/products?q=${encodeURIComponent(q)}`,
      { credentials: "include" }
    );
    if (res.ok) {
      const j = await res.json();
      setProducts(j.products ?? []);
    }
  }, [storeId, q]);

  useEffect(() => {
    const t = setTimeout(() => void loadProducts(), 250);
    return () => clearTimeout(t);
  }, [loadProducts]);

  useEffect(() => {
    setVerifications((prev) => {
      const next = [...prev];
      while (next.length < cart.length) next.push(emptyVerification());
      while (next.length > cart.length) next.pop();
      return next;
    });
  }, [cart.length]);

  function addToCart(p: ProductOpt) {
    setCart((c) => {
      const existing = c.find((x) => x.productId === p.id);
      if (existing) {
        return c.map((x) => (x.productId === p.id ? { ...x, quantity: x.quantity + 1 } : x));
      }
      return [
        ...c,
        {
          productId: p.id,
          name: p.name,
          quantity: 1,
          unitPrice: p.retailPrice,
          ageRestricted: p.ageRestricted,
          minimumAge: p.minimumAge,
        },
      ];
    });
  }

  function setQty(productId: string, quantity: number) {
    if (quantity < 1) {
      setCart((c) => c.filter((x) => x.productId !== productId));
      return;
    }
    setCart((c) => c.map((x) => (x.productId === productId ? { ...x, quantity } : x)));
  }

  async function completeSale() {
    setBusy(true);
    setToast(null);
    const verifPayload = cart.map((line, i) => {
      if (!line.ageRestricted) return null;
      const v = verifications[i] ?? emptyVerification();
      return {
        method: v.method,
        customerDob: v.customerDob || null,
        idType: v.idType || null,
        expiredId: v.expiredId,
        noIdPresent: v.noIdPresent,
      };
    });

    const res = await fetch(`/api/store/${encodeURIComponent(storeId)}/compliance/pos-sim`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        lineItems: cart.map((c) => ({ productId: c.productId, quantity: c.quantity })),
        paymentMethod,
        verifications: verifPayload,
      }),
    });

    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setToast(j.message ?? "Sale completed.");
      setCart([]);
    } else {
      setToast(j.message ?? j.error ?? "Sale blocked or failed.");
    }
    setTimeout(() => setToast(null), 5000);
  }

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <p>
        <Link href={`/store/${encodeURIComponent(storeId)}/compliance`} style={{ color: "#2563eb" }}>
          ← Compliance
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>POS age verification (simulator)</h1>
      <p style={{ opacity: 0.85, fontSize: 14, maxWidth: 720 }}>
        Mock checkout: add products, complete verification for each age-restricted line, then tender. Underage,
        expired ID, or no ID blocks the sale and logs a decline.
      </p>

      {toast ? (
        <div style={{ padding: 12, background: "#111827", color: "#fff", borderRadius: 8, marginBottom: 16 }}>{toast}</div>
      ) : null}

      <div style={{ display: "grid", gap: 20, gridTemplateColumns: "1fr 1fr" }}>
        <section>
          <h2 style={{ fontSize: 16 }}>Add products</h2>
          <input
            placeholder="Search name or UPC…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ padding: 8, width: "100%", marginBottom: 8 }}
          />
          <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid #e5e7eb", borderRadius: 8 }}>
            {products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addToCart(p)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: 10,
                  border: "none",
                  borderBottom: "1px solid #eee",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                <strong>{p.name}</strong>{" "}
                <span style={{ opacity: 0.75, fontSize: 12 }}>
                  ${p.retailPrice} {p.ageRestricted ? `· min ${p.minimumAge}` : ""}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <h2 style={{ fontSize: 16 }}>Cart</h2>
          {cart.length === 0 ? (
            <p style={{ opacity: 0.7 }}>No items.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {cart.map((line, i) => (
                <li key={line.productId} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #eee" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span>
                      {line.name}{" "}
                      {line.ageRestricted ? (
                        <span style={{ color: "#b45309", fontSize: 12 }}>(age {line.minimumAge}+)</span>
                      ) : null}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={line.quantity}
                      onChange={(e) => setQty(line.productId, Number(e.target.value))}
                      style={{ width: 56 }}
                    />
                  </div>
                  {line.ageRestricted ? (
                    <div style={{ marginTop: 8, padding: 10, background: "#fffbeb", borderRadius: 6, fontSize: 13 }}>
                      <div style={{ marginBottom: 6 }}>Verification</div>
                      <label style={{ display: "block", marginBottom: 4 }}>
                        Method{" "}
                        <select
                          value={verifications[i]?.method ?? "id_manual_entry"}
                          onChange={(e) =>
                            setVerifications((v) => {
                              const n = [...v];
                              n[i] = { ...(n[i] ?? emptyVerification()), method: e.target.value as VerificationDraft["method"] };
                              return n;
                            })
                          }
                        >
                          <option value="visual_check">Visual check</option>
                          <option value="id_scanned">ID scanned</option>
                          <option value="id_manual_entry">ID manually entered</option>
                        </select>
                      </label>
                      <label style={{ display: "block", marginBottom: 4 }}>
                        Customer DOB{" "}
                        <input
                          type="date"
                          value={verifications[i]?.customerDob ?? ""}
                          onChange={(e) =>
                            setVerifications((v) => {
                              const n = [...v];
                              n[i] = { ...(n[i] ?? emptyVerification()), customerDob: e.target.value };
                              return n;
                            })
                          }
                        />
                      </label>
                      <label style={{ display: "block", marginBottom: 4 }}>
                        ID type{" "}
                        <select
                          value={verifications[i]?.idType ?? "drivers_license"}
                          onChange={(e) =>
                            setVerifications((v) => {
                              const n = [...v];
                              n[i] = {
                                ...(n[i] ?? emptyVerification()),
                                idType: e.target.value as VerificationDraft["idType"],
                              };
                              return n;
                            })
                          }
                        >
                          <option value="drivers_license">Driver license</option>
                          <option value="state_id">State ID</option>
                          <option value="passport">Passport</option>
                          <option value="military_id">Military ID</option>
                        </select>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <input
                          type="checkbox"
                          checked={verifications[i]?.expiredId ?? false}
                          onChange={(e) =>
                            setVerifications((v) => {
                              const n = [...v];
                              n[i] = { ...(n[i] ?? emptyVerification()), expiredId: e.target.checked };
                              return n;
                            })
                          }
                        />
                        ID expired (decline)
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={verifications[i]?.noIdPresent ?? false}
                          onChange={(e) =>
                            setVerifications((v) => {
                              const n = [...v];
                              n[i] = { ...(n[i] ?? emptyVerification()), noIdPresent: e.target.checked };
                              return n;
                            })
                          }
                        />
                        No ID presented (decline)
                      </label>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <label style={{ display: "block", marginTop: 12 }}>
            Payment{" "}
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}>
              <option value="cash">Cash</option>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
              <option value="mobile">Mobile</option>
            </select>
          </label>

          <button
            type="button"
            style={{ marginTop: 16, padding: "10px 20px" }}
            disabled={busy || cart.length === 0}
            onClick={() => void completeSale()}
          >
            {busy ? "Processing…" : "Complete sale"}
          </button>
        </section>
      </div>
    </main>
  );
}
