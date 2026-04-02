export type FuelPriceParams = {
  stationId: string;
  zip?: string;
};

export type FuelPrice = {
  product: "unleaded" | "diesel";
  priceCentsPerGallon: number;
  updatedAt: string;
};

export interface FuelAdapter {
  getFuelPricing(params: FuelPriceParams): Promise<{ stationId: string; prices: FuelPrice[] }>;
}

