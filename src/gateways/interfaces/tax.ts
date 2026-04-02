export type TaxCalculationParams = {
  amountCents: number;
  currency: "USD";
  country: "US";
  state: string;
  zip?: string;
};

export type TaxCalculationResult = {
  taxCents: number;
  totalCents: number;
  rateBps: number; // basis points
};

export interface TaxAdapter {
  calculateTax(params: TaxCalculationParams): Promise<TaxCalculationResult>;
}

