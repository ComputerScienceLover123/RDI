export type PayrollRunStatus = "queued" | "processing" | "completed";

export type PayrollRunParams = {
  storeId: string;
  periodStart: string; // ISO date
  periodEnd: string; // ISO date
};

export type PayrollEmployeeEarnings = {
  employeeRef: string;
  hours: number;
  hourlyRateCents: number;
  grossCents: number;
  deductionsCents: number;
  netCents: number;
};

export type PayrollRunResult = {
  id: string;
  status: PayrollRunStatus;
  storeId: string;
  periodStart: string;
  periodEnd: string;
  totalGrossCents: number;
  totalNetCents: number;
  employees: PayrollEmployeeEarnings[];
};

export interface PayrollAdapter {
  runPayroll(params: PayrollRunParams): Promise<PayrollRunResult>;
}

