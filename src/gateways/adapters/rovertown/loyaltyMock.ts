import type { LoyaltyAdapter, GetPointsBalanceResult, IssuePointsResult } from "@/gateways/interfaces/loyalty";

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

function makeTier(points: number) {
  if (points >= 20000) return "platinum";
  if (points >= 10000) return "gold";
  if (points >= 5000) return "silver";
  return "bronze";
}

export const rovertownLoyaltyMockAdapter: LoyaltyAdapter = {
  async getPointsBalance(params): Promise<GetPointsBalanceResult> {
    const seed = params.customerRef.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const pointsBalance = 1200 + (seed % 23000);
    const tier = makeTier(pointsBalance);
    return {
      customerRef: params.customerRef,
      pointsBalance,
      tier: tier as GetPointsBalanceResult["tier"],
      updatedAt: new Date().toISOString(),
    };
  },

  async issuePoints(params): Promise<IssuePointsResult> {
    const createdAt = new Date().toISOString();
    const status = params.points % 9 === 0 ? "failed" : "issued";
    return {
      id: makeId("lp"),
      status,
      customerRef: params.customerRef,
      points: params.points,
      createdAt,
    };
  },
};

