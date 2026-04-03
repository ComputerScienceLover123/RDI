export type DenominationBreakdown = {
  // Bills
  hundreds?: number;
  fifties?: number;
  twenties?: number;
  tens?: number;
  fives?: number;
  ones?: number;
  // Coins
  quarters?: number;
  dimes?: number;
  nickels?: number;
  pennies?: number;
};

export function sumDenominationBreakdown(breakdown: DenominationBreakdown): {
  billsCents: number;
  coinsCents: number;
  totalCents: number;
} {
  const bill = (n: unknown) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
  const hundreds = bill(breakdown.hundreds);
  const fifties = bill(breakdown.fifties);
  const twenties = bill(breakdown.twenties);
  const tens = bill(breakdown.tens);
  const fives = bill(breakdown.fives);
  const ones = bill(breakdown.ones);

  const quarters = bill(breakdown.quarters);
  const dimes = bill(breakdown.dimes);
  const nickels = bill(breakdown.nickels);
  const pennies = bill(breakdown.pennies);

  const billsCents =
    hundreds * 10000 +
    fifties * 5000 +
    twenties * 2000 +
    tens * 1000 +
    fives * 500 +
    ones * 100;

  const coinsCents = quarters * 25 + dimes * 10 + nickels * 5 + pennies * 1;
  return { billsCents, coinsCents, totalCents: billsCents + coinsCents };
}

