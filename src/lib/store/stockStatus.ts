/** Green: comfortably above minimum. Yellow: above min but within 20% band. Red: at or below minimum. */
export type StockLevel = "green" | "yellow" | "red";

export function getStockLevel(quantityOnHand: number, minStockThreshold: number): StockLevel {
  const min = minStockThreshold;
  if (min <= 0) {
    if (quantityOnHand <= 0) return "red";
    return "green";
  }
  if (quantityOnHand <= min) return "red";
  const yellowCeiling = min + Math.ceil(min * 0.2);
  if (quantityOnHand <= yellowCeiling) return "yellow";
  return "green";
}

export function stockLevelStyles(level: StockLevel): { background: string; color: string; label: string } {
  switch (level) {
    case "green":
      return { background: "#e6f7ed", color: "#0d6d32", label: "OK" };
    case "yellow":
      return { background: "#fff8e6", color: "#946200", label: "Low" };
    case "red":
      return { background: "#fdecea", color: "#b42318", label: "Critical" };
  }
}
