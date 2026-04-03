"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type StoreRow = { id: string; name: string; hatchEnabled: boolean };

export default function AdminFoodserviceClient() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [hatchRecipes, setHatchRecipes] = useState<Array<{ id: string; name: string; category: string }>>([]);
  const [hatchMenuCount, setHatchMenuCount] = useState(0);
  const [recipes, setRecipes] = useState<
    Array<{
      id: string;
      name: string;
      brand: string;
      category: string;
      active: boolean;
      yieldQuantity: string;
      ingredientCount: number;
    }>
  >([]);
  const [products, setProducts] = useState<Array<{ id: string; name: string; upc: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const [newRecipe, setNewRecipe] = useState({
    name: "",
    brand: "store_brand" as "store_brand" | "hatch",
    category: "roller_grill",
    instructions: "",
    prepTimeMinutes: "10",
    cookTimeMinutes: "15",
    cookTemperature: "350°F",
    yieldQuantity: "12",
    ingredientProductId: "",
    ingredientQty: "1",
    ingredientUom: "each",
  });

  const [newMenu, setNewMenu] = useState({
    storeId: "",
    itemName: "",
    category: "roller_grill",
    brand: "store_brand" as "store_brand" | "hatch",
    recipeId: "",
    retailPrice: "3.49",
    holdTimeMinutes: "120",
    prepTimeMinutes: "10",
  });

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  }, []);

  const loadHatch = useCallback(async () => {
    const r = await fetch("/api/admin/foodservice/hatch", { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Failed to load Hatch overview");
      return;
    }
    setStores(j.stores ?? []);
    setHatchRecipes(j.hatchRecipes ?? []);
    setHatchMenuCount(j.hatchMenuItemsActive ?? 0);
    setNewMenu((prev) => ({ ...prev, storeId: prev.storeId || j.stores?.[0]?.id || "" }));
  }, [showToast]);

  const loadRecipes = useCallback(async () => {
    const r = await fetch("/api/admin/foodservice/recipes", { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Failed to load recipes");
      return;
    }
    setRecipes(j.recipes ?? []);
    setNewMenu((prev) => ({ ...prev, recipeId: prev.recipeId || j.recipes?.[0]?.id || "" }));
  }, [showToast]);

  const loadProducts = useCallback(async () => {
    const r = await fetch("/api/admin/pricebook?category=foodservice&active=true", { credentials: "include" });
    const j = await r.json().catch(() => null);
    if (!r.ok) return;
    const rows = (j.products as Array<{ id: string; name: string; upc: string }>) ?? [];
    setProducts(rows);
    setNewRecipe((prev) => ({ ...prev, ingredientProductId: prev.ingredientProductId || rows[0]?.id || "" }));
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadHatch(), loadRecipes(), loadProducts()]);
    setLoading(false);
  }, [loadHatch, loadRecipes, loadProducts]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function toggleHatch(storeId: string, hatchEnabled: boolean) {
    const r = await fetch(`/api/admin/foodservice/stores/${encodeURIComponent(storeId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ hatchEnabled }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Update failed");
      return;
    }
    showToast("Store updated");
    await loadHatch();
  }

  async function createRecipe(e: FormEvent) {
    e.preventDefault();
    const ingredients =
      newRecipe.ingredientProductId.trim() ?
        [
          {
            productId: newRecipe.ingredientProductId.trim(),
            quantityPerBatch: Number(newRecipe.ingredientQty),
            unitOfMeasure: newRecipe.ingredientUom,
          },
        ]
      : undefined;
    if (ingredients && (!Number.isFinite(ingredients[0]!.quantityPerBatch) || ingredients[0]!.quantityPerBatch <= 0)) {
      showToast("Invalid ingredient quantity");
      return;
    }
    const r = await fetch("/api/admin/foodservice/recipes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: newRecipe.name,
        brand: newRecipe.brand,
        category: newRecipe.category,
        instructions: newRecipe.instructions,
        prepTimeMinutes: Number(newRecipe.prepTimeMinutes),
        cookTimeMinutes: Number(newRecipe.cookTimeMinutes),
        cookTemperature: newRecipe.cookTemperature || null,
        yieldQuantity: Number(newRecipe.yieldQuantity),
        ingredients,
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Create failed");
      return;
    }
    showToast(`Recipe created (${j.id})`);
    await loadRecipes();
  }

  async function createMenuItem(e: FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/admin/foodservice/menu-items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        storeId: newMenu.storeId,
        itemName: newMenu.itemName,
        category: newMenu.category,
        brand: newMenu.brand,
        recipeId: newMenu.recipeId || null,
        retailPrice: Number(newMenu.retailPrice),
        holdTimeMinutes: Number(newMenu.holdTimeMinutes),
        prepTimeMinutes: Number(newMenu.prepTimeMinutes),
      }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      showToast(j?.error ?? "Create failed");
      return;
    }
    showToast(`Menu item created (${j.id})`);
  }

  const categories = [
    "roller_grill",
    "pizza",
    "chicken",
    "sides",
    "taquitos",
    "tacos",
    "beverages",
    "other",
  ];

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
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
            fontSize: 14,
          }}
        >
          {toast}
        </div>
      ) : null}

      <h1 style={{ marginTop: 0 }}>Foodservice (admin)</h1>
      <p style={{ opacity: 0.85 }}>
        Manage Hatch store assignments, recipes, and per-store menu items. Store teams use the Foodservice module on the
        store dashboard.
      </p>

      {loading ? <p>Loading…</p> : null}

      <section style={{ marginTop: 32 }}>
        <h2>Hatch locations</h2>
        <p style={{ fontSize: 14, opacity: 0.85 }}>
          Active Hatch menu rows (all stores): <strong>{hatchMenuCount}</strong>. Hatch recipes:{" "}
          <strong>{hatchRecipes.length}</strong>.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
              <th style={{ padding: 8 }}>Store</th>
              <th style={{ padding: 8 }}>Hatch enabled</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                <td style={{ padding: 8 }}>
                  {s.name} <code style={{ fontSize: 12 }}>{s.id}</code>
                </td>
                <td style={{ padding: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={s.hatchEnabled}
                      onChange={(e) => void toggleHatch(s.id, e.target.checked)}
                    />
                    <span>{s.hatchEnabled ? "Yes" : "No"}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2>Recipes</h2>
        <ul style={{ fontSize: 14, paddingLeft: 18 }}>
          {recipes.map((r) => (
            <li key={r.id} style={{ marginBottom: 6 }}>
              <strong>{r.name}</strong> · {r.brand} · {r.category} · yield {r.yieldQuantity} · {r.ingredientCount}{" "}
              ingredients · {r.active ? "active" : "inactive"}
            </li>
          ))}
        </ul>

        <h3>Create recipe</h3>
        <form onSubmit={createRecipe} style={{ display: "grid", gap: 12, maxWidth: 520 }}>
          <input
            placeholder="Recipe name"
            value={newRecipe.name}
            onChange={(e) => setNewRecipe((p) => ({ ...p, name: e.target.value }))}
            required
            style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          />
          <select
            value={newRecipe.brand}
            onChange={(e) => setNewRecipe((p) => ({ ...p, brand: e.target.value as "store_brand" | "hatch" }))}
            style={{ padding: 8 }}
          >
            <option value="store_brand">Store brand</option>
            <option value="hatch">Hatch</option>
          </select>
          <select
            value={newRecipe.category}
            onChange={(e) => setNewRecipe((p) => ({ ...p, category: e.target.value }))}
            style={{ padding: 8 }}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <textarea
            placeholder="Instructions"
            value={newRecipe.instructions}
            onChange={(e) => setNewRecipe((p) => ({ ...p, instructions: e.target.value }))}
            required
            rows={4}
            style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              placeholder="Prep min"
              value={newRecipe.prepTimeMinutes}
              onChange={(e) => setNewRecipe((p) => ({ ...p, prepTimeMinutes: e.target.value }))}
              style={{ width: 100, padding: 8 }}
            />
            <input
              placeholder="Cook min"
              value={newRecipe.cookTimeMinutes}
              onChange={(e) => setNewRecipe((p) => ({ ...p, cookTimeMinutes: e.target.value }))}
              style={{ width: 100, padding: 8 }}
            />
            <input
              placeholder="Cook temp"
              value={newRecipe.cookTemperature}
              onChange={(e) => setNewRecipe((p) => ({ ...p, cookTemperature: e.target.value }))}
              style={{ width: 120, padding: 8 }}
            />
            <input
              placeholder="Yield (servings)"
              value={newRecipe.yieldQuantity}
              onChange={(e) => setNewRecipe((p) => ({ ...p, yieldQuantity: e.target.value }))}
              style={{ width: 140, padding: 8 }}
            />
          </div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>Optional first ingredient (add more via DB or future editor)</div>
          <select
            value={newRecipe.ingredientProductId}
            onChange={(e) => setNewRecipe((p) => ({ ...p, ingredientProductId: e.target.value }))}
            style={{ padding: 8 }}
          >
            <option value="">— Product —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.upc})
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              placeholder="Qty / batch"
              value={newRecipe.ingredientQty}
              onChange={(e) => setNewRecipe((p) => ({ ...p, ingredientQty: e.target.value }))}
              style={{ padding: 8, width: 100 }}
            />
            <input
              placeholder="UOM"
              value={newRecipe.ingredientUom}
              onChange={(e) => setNewRecipe((p) => ({ ...p, ingredientUom: e.target.value }))}
              style={{ padding: 8, width: 100 }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: "10px 18px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
              width: "fit-content",
            }}
          >
            Create recipe
          </button>
        </form>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2>Menu item (per store)</h2>
        <form onSubmit={createMenuItem} style={{ display: "grid", gap: 12, maxWidth: 520 }}>
          <select
            value={newMenu.storeId}
            onChange={(e) => setNewMenu((p) => ({ ...p, storeId: e.target.value }))}
            required
            style={{ padding: 8 }}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Item name"
            value={newMenu.itemName}
            onChange={(e) => setNewMenu((p) => ({ ...p, itemName: e.target.value }))}
            required
            style={{ padding: 8, borderRadius: 6, border: "1px solid #ccc" }}
          />
          <select
            value={newMenu.category}
            onChange={(e) => setNewMenu((p) => ({ ...p, category: e.target.value }))}
            style={{ padding: 8 }}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={newMenu.brand}
            onChange={(e) => setNewMenu((p) => ({ ...p, brand: e.target.value as "store_brand" | "hatch" }))}
            style={{ padding: 8 }}
          >
            <option value="store_brand">Store brand</option>
            <option value="hatch">Hatch</option>
          </select>
          <select
            value={newMenu.recipeId}
            onChange={(e) => setNewMenu((p) => ({ ...p, recipeId: e.target.value }))}
            style={{ padding: 8 }}
          >
            <option value="">— Recipe (optional) —</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              placeholder="Retail price"
              value={newMenu.retailPrice}
              onChange={(e) => setNewMenu((p) => ({ ...p, retailPrice: e.target.value }))}
              style={{ padding: 8, width: 120 }}
            />
            <input
              placeholder="Hold (min)"
              value={newMenu.holdTimeMinutes}
              onChange={(e) => setNewMenu((p) => ({ ...p, holdTimeMinutes: e.target.value }))}
              style={{ padding: 8, width: 100 }}
            />
            <input
              placeholder="Prep (min)"
              value={newMenu.prepTimeMinutes}
              onChange={(e) => setNewMenu((p) => ({ ...p, prepTimeMinutes: e.target.value }))}
              style={{ padding: 8, width: 100 }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: "10px 18px",
              background: "#111",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
              width: "fit-content",
            }}
          >
            Create menu item
          </button>
        </form>
      </section>
    </div>
  );
}
