export type StoreLedgerLine = {
  date: string; // ISO date
  reference: string;
  description: string;
  amountCents: number; // positive/negative
};

export type StoreLedgerParams = {
  storeId: string;
  fromDate: string; // ISO date
  toDate: string; // ISO date
};

export type StoreLedgerResult = {
  storeId: string;
  fromDate: string;
  toDate: string;
  currency: "USD";
  openingBalanceCents: number;
  closingBalanceCents: number;
  lines: StoreLedgerLine[];
};

export interface AccountingAdapter {
  getStoreLedger(params: StoreLedgerParams): Promise<StoreLedgerResult>;
}

