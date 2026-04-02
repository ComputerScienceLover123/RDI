import type { PaymentsAdapter, CreateChargeResult, CreateChargeParams, RefundResult, RefundParams } from "@/gateways/interfaces/payments";

function makeId(prefix: string) {
  return `${prefix}_${Math.floor(Date.now() / 1000)}_${Math.floor(Math.random() * 1e6)}`;
}

function makeApprovedStatus(amountCents: number) {
  // Deterministic-ish: decline if amount divisible by 17.
  return amountCents % 17 === 0 ? "declined" : "approved";
}

export const verifonePaymentsMockAdapter: PaymentsAdapter = {
  async createCharge(params: CreateChargeParams): Promise<CreateChargeResult> {
    const createdAt = new Date().toISOString();
    const status = makeApprovedStatus(params.amountCents) as "approved" | "declined";
    return {
      id: makeId("ch"),
      status,
      amountCents: params.amountCents,
      currency: params.currency,
      customerRef: params.customerRef,
      paymentMethod: params.paymentMethod,
      createdAt,
    };
  },

  async refund(params: RefundParams): Promise<RefundResult> {
    const createdAt = new Date().toISOString();
    const amountCents = params.amountCents ?? 0;
    const ok = amountCents > 0 ? params.chargeId.length % 2 === 0 : false;
    return {
      id: makeId("rf"),
      status: ok ? "refunded" : "failed",
      chargeId: params.chargeId,
      amountCents: amountCents,
      createdAt,
    };
  },
};

