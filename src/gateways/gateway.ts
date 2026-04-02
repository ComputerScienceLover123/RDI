import paymentsAdapter from "@/gateways/adapters/payments/adapter";
import payrollAdapter from "@/gateways/adapters/payroll/adapter";
import loyaltyAdapter from "@/gateways/adapters/loyalty/adapter";
import accountingAdapter from "@/gateways/adapters/accounting/adapter";
import taxAdapter from "@/gateways/adapters/tax/adapter";
import fuelAdapter from "@/gateways/adapters/fuel/adapter";

export const gateway = {
  payments: {
    createCharge: (params: any) => paymentsAdapter.createCharge(params),
    refund: (params: any) => paymentsAdapter.refund(params),
  },
  payroll: {
    runPayroll: (params: any) => payrollAdapter.runPayroll(params),
  },
  loyalty: {
    getPointsBalance: (params: any) => loyaltyAdapter.getPointsBalance(params),
    issuePoints: (params: any) => loyaltyAdapter.issuePoints(params),
  },
  accounting: {
    getStoreLedger: (params: any) => accountingAdapter.getStoreLedger(params),
  },
  tax: {
    calculateTax: (params: any) => taxAdapter.calculateTax(params),
  },
  fuel: {
    getFuelPricing: (params: any) => fuelAdapter.getFuelPricing(params),
  },
};

