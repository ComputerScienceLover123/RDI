import type { PayrollAdapter, PayrollRunParams, PayrollRunResult, PayrollEmployeeEarnings } from "@/gateways/interfaces/payroll";

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function makeEmployeeEarnings(storeId: string, idx: number): PayrollEmployeeEarnings {
  const seed = storeId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) + idx * 97;
  const hours = 20 + (seed % 21); // 20-40
  const hourlyRateCents = 1400 + (seed % 6500); // $14-$77
  const grossCents = hours * hourlyRateCents;
  const deductionsCents = Math.floor(grossCents * (0.11 + ((seed % 13) / 1000))); // ~11-24%
  const netCents = grossCents - deductionsCents;
  return {
    employeeRef: `EMP_${storeId.slice(-3)}_${String(idx).padStart(2, "0")}`,
    hours,
    hourlyRateCents,
    grossCents,
    deductionsCents,
    netCents,
  };
}

export const ukgPayrollMockAdapter: PayrollAdapter = {
  async runPayroll(params: PayrollRunParams): Promise<PayrollRunResult> {
    const employees = [1, 2, 3, 4].map((i) => makeEmployeeEarnings(params.storeId, i));
    const totalGrossCents = employees.reduce((acc, e) => acc + e.grossCents, 0);
    const totalNetCents = employees.reduce((acc, e) => acc + e.netCents, 0);

    return {
      id: makeId("pay"),
      status: "completed",
      storeId: params.storeId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      totalGrossCents,
      totalNetCents,
      employees,
    };
  },
};

