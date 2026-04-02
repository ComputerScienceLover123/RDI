export type PaymentCurrency = "USD" | "GBP" | "EUR";

export type CardPaymentMethod = {
  type: "card";
  last4: string;
  brand: "visa" | "mastercard" | "amex";
};

export type CreateChargeParams = {
  amountCents: number;
  currency: PaymentCurrency;
  customerRef: string;
  paymentMethod: CardPaymentMethod;
  description?: string;
};

export type CreateChargeResult = {
  id: string;
  status: "approved" | "declined";
  amountCents: number;
  currency: PaymentCurrency;
  customerRef: string;
  paymentMethod: CardPaymentMethod;
  createdAt: string;
};

export type RefundParams = {
  chargeId: string;
  amountCents?: number;
  reason?: string;
};

export type RefundResult = {
  id: string;
  status: "refunded" | "failed";
  chargeId: string;
  amountCents: number;
  createdAt: string;
};

export interface PaymentsAdapter {
  createCharge(params: CreateChargeParams): Promise<CreateChargeResult>;
  refund(params: RefundParams): Promise<RefundResult>;
}

