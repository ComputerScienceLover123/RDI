import { Prisma } from "@prisma/client";

export const LOTTERY_TICKET_PRICES = [1, 2, 3, 5, 10, 20, 30] as const;

export function isAllowedTicketPrice(n: number): boolean {
  return (LOTTERY_TICKET_PRICES as readonly number[]).includes(n);
}

export function toTicketPriceDecimal(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}
