export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

export type GetPointsBalanceParams = {
  customerRef: string;
};

export type GetPointsBalanceResult = {
  customerRef: string;
  pointsBalance: number;
  tier: LoyaltyTier;
  updatedAt: string;
};

export type IssuePointsParams = {
  customerRef: string;
  points: number;
  reason?: string;
};

export type IssuePointsResult = {
  id: string;
  status: "issued" | "failed";
  customerRef: string;
  points: number;
  createdAt: string;
};

export interface LoyaltyAdapter {
  getPointsBalance(params: GetPointsBalanceParams): Promise<GetPointsBalanceResult>;
  issuePoints(params: IssuePointsParams): Promise<IssuePointsResult>;
}

