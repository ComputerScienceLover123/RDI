import type { AccountingAdapter, StoreLedgerParams, StoreLedgerResult } from "@/gateways/interfaces/accounting";

function makeSeed(storeId: string) {
  return storeId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

export const accountingMockAdapter: AccountingAdapter = {
  async getStoreLedger(params: StoreLedgerParams): Promise<StoreLedgerResult> {
    const seed = makeSeed(params.storeId);
    const openingBalanceCents = 250000 + (seed % 90000);
    const lines = [
      {
        date: params.fromDate,
        reference: `INV-${params.storeId.slice(-3)}-1001`,
        description: "Invoice payment",
        amountCents: 1999 + (seed % 7000),
      },
      {
        date: params.toDate,
        reference: `FEE-${params.storeId.slice(-3)}-2007`,
        description: "Service fee",
        amountCents: -(2499 + (seed % 3500)),
      },
      {
        date: params.toDate,
        reference: `ADJ-${params.storeId.slice(-3)}-3004`,
        description: "Inventory adjustment",
        amountCents: 1499 + (seed % 6200),
      },
    ];

    const totalDelta = lines.reduce((acc, l) => acc + l.amountCents, 0);
    return {
      storeId: params.storeId,
      fromDate: params.fromDate,
      toDate: params.toDate,
      currency: "USD",
      openingBalanceCents,
      closingBalanceCents: openingBalanceCents + totalDelta,
      lines,
    };
  },
};

