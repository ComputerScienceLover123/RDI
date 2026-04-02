import type { TaxAdapter, TaxCalculationParams, TaxCalculationResult } from "@/gateways/interfaces/tax";

function makeRateBps(state: string) {
  // Deterministic-ish, not real rates; demo only.
  const seed = state.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return 450 + (seed % 800); // 4.50% - 12.30%
}

export const taxMockAdapter: TaxAdapter = {
  async calculateTax(params: TaxCalculationParams): Promise<TaxCalculationResult> {
    const rateBps = makeRateBps(params.state);
    const taxCents = Math.floor((params.amountCents * rateBps) / 10000);
    const totalCents = params.amountCents + taxCents;
    return { taxCents, totalCents, rateBps };
  },
};

