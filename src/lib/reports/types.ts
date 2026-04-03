import type { HqReportType } from "@prisma/client";

export type ReportTable = {
  title: string;
  columns: string[];
  rows: (string | number)[][];
};

export type HqReportPayload = {
  reportType: HqReportType;
  title: string;
  tables: ReportTable[];
  /** Plain text lines for simple CSV fallback */
  summaryLines?: string[];
};

export function reportTypeTitle(t: HqReportType): string {
  const map: Record<HqReportType, string> = {
    sales_summary: "Sales summary",
    inventory_valuation: "Inventory valuation",
    purchase_order_summary: "Purchase order summary",
    labor_summary: "Labor summary",
    fuel_performance: "Fuel performance",
    foodservice: "Foodservice",
    lottery: "Lottery",
    scan_data: "Scan data",
    shrinkage: "Shrinkage",
  };
  return map[t] ?? t;
}
