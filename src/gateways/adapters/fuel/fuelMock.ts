import type { FuelAdapter, FuelPrice, FuelPriceParams } from "@/gateways/interfaces/fuel";

function seedFrom(params: FuelPriceParams) {
  return (params.stationId + (params.zip ?? "")).split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

export const fuelMockAdapter: FuelAdapter = {
  async getFuelPricing(params: FuelPriceParams): Promise<{ stationId: string; prices: FuelPrice[] }> {
    const seed = seedFrom(params);
    const now = new Date().toISOString();
    const unleaded = 299 + (seed % 90); // cents/gal: 2.99 - 3.89
    const diesel = 349 + ((seed * 3) % 110); // cents/gal: 3.49 - 4.59
    return {
      stationId: params.stationId,
      prices: [
        { product: "unleaded", priceCentsPerGallon: unleaded, updatedAt: now },
        { product: "diesel", priceCentsPerGallon: diesel, updatedAt: now },
      ],
    };
  },
};

