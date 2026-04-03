import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sumDenominationBreakdown, type DenominationBreakdown } from "./denoms";

export function totalsFromDenoms(breakdown: DenominationBreakdown): {
  billsTotal: Prisma.Decimal;
  coinsTotal: Prisma.Decimal;
  total: Prisma.Decimal;
} {
  const { billsCents, coinsCents, totalCents } = sumDenominationBreakdown(breakdown);
  const billsTotal = new Prisma.Decimal((billsCents / 100).toFixed(2));
  const coinsTotal = new Prisma.Decimal((coinsCents / 100).toFixed(2));
  const total = new Prisma.Decimal((totalCents / 100).toFixed(2));
  return { billsTotal, coinsTotal, total };
}

export async function calcRegisterExpectedClosing(opts: {
  storeId: string;
  registerId: string;
  openedAt: Date;
  closedAt: Date;
  openingCashAmount: Prisma.Decimal;
}): Promise<{
  cashSales: Prisma.Decimal;
  cashRefunds: Prisma.Decimal;
  safeDrops: Prisma.Decimal;
  changeOrdersReceived: Prisma.Decimal;
  expectedClosingAmount: Prisma.Decimal;
}> {
  const { storeId, registerId, openedAt, closedAt, openingCashAmount } = opts;

  const [salesAgg, refundsAgg, safeDropAgg, changeAgg] = await Promise.all([
    prisma.posTransaction.aggregate({
      where: {
        storeId,
        type: "sale",
        paymentMethod: "cash",
        transactionAt: { gte: openedAt, lte: closedAt },
      },
      _sum: { total: true },
    }),
    prisma.posTransaction.aggregate({
      where: {
        storeId,
        type: "refund",
        paymentMethod: "cash",
        transactionAt: { gte: openedAt, lte: closedAt },
      },
      _sum: { total: true },
    }),
    prisma.cashDrop.aggregate({
      where: {
        registerId,
        dropType: "safe_drop",
        droppedAt: { gte: openedAt, lte: closedAt },
      },
      _sum: { amountDropped: true },
    }),
    prisma.cashDrop.aggregate({
      where: {
        registerId,
        dropType: "change_order_received",
        droppedAt: { gte: openedAt, lte: closedAt },
      },
      _sum: { amountDropped: true },
    }),
  ]);

  const cashSales = salesAgg._sum.total ?? new Prisma.Decimal(0);
  const cashRefunds = refundsAgg._sum.total ?? new Prisma.Decimal(0);
  const safeDrops = safeDropAgg._sum.amountDropped ?? new Prisma.Decimal(0);
  const changeOrdersReceived = changeAgg._sum.amountDropped ?? new Prisma.Decimal(0);

  // Expected = opening cash + cash sales - cash refunds - safe drops + change-orders received.
  const expectedClosingAmount = openingCashAmount
    .add(cashSales)
    .sub(cashRefunds)
    .sub(safeDrops)
    .add(changeOrdersReceived);

  return {
    cashSales,
    cashRefunds,
    safeDrops,
    changeOrdersReceived,
    expectedClosingAmount,
  };
}

export async function calcSafeExpectedBalance(opts: {
  storeId: string;
  safeCountAt: Date;
}): Promise<{
  lastSafeCountAt: Date | null;
  lastSafeCountTotal: Prisma.Decimal;
  safeDrops: Prisma.Decimal;
  bankDeposits: Prisma.Decimal;
  changeOrdersReceived: Prisma.Decimal;
  expectedSafeBalance: Prisma.Decimal;
}> {
  const { storeId, safeCountAt } = opts;

  const lastSafe = await prisma.cashCount.findFirst({
    where: { storeId, registerId: null, countType: "safe_count" },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true, totalCountedAmount: true },
  });

  if (!lastSafe) {
    const [safeDropsAgg, bankDepositsAgg, changeAgg] = await Promise.all([
      prisma.cashDrop.aggregate({
        where: { storeId, dropType: "safe_drop", droppedAt: { lte: safeCountAt } },
        _sum: { amountDropped: true },
      }),
      prisma.cashDrop.aggregate({
        where: { storeId, dropType: "bank_deposit", droppedAt: { lte: safeCountAt } },
        _sum: { amountDropped: true },
      }),
      prisma.cashDrop.aggregate({
        where: { storeId, dropType: "change_order_received", droppedAt: { lte: safeCountAt } },
        _sum: { amountDropped: true },
      }),
    ]);

    const safeDrops = safeDropsAgg._sum.amountDropped ?? new Prisma.Decimal(0);
    const bankDeposits = bankDepositsAgg._sum.amountDropped ?? new Prisma.Decimal(0);
    const changeOrdersReceived = changeAgg._sum.amountDropped ?? new Prisma.Decimal(0);

    const expectedSafeBalance = new Prisma.Decimal(0).add(safeDrops).sub(bankDeposits).sub(changeOrdersReceived);
    return {
      lastSafeCountAt: null,
      lastSafeCountTotal: new Prisma.Decimal(0),
      safeDrops,
      bankDeposits,
      changeOrdersReceived,
      expectedSafeBalance,
    };
  }

  const [safeDropsAgg, bankDepositsAgg, changeAgg] = await Promise.all([
    prisma.cashDrop.aggregate({
      where: { storeId, dropType: "safe_drop", droppedAt: { gt: lastSafe.timestamp, lte: safeCountAt } },
      _sum: { amountDropped: true },
    }),
    prisma.cashDrop.aggregate({
      where: { storeId, dropType: "bank_deposit", droppedAt: { gt: lastSafe.timestamp, lte: safeCountAt } },
      _sum: { amountDropped: true },
    }),
    prisma.cashDrop.aggregate({
      where: { storeId, dropType: "change_order_received", droppedAt: { gt: lastSafe.timestamp, lte: safeCountAt } },
      _sum: { amountDropped: true },
    }),
  ]);

  const safeDrops = safeDropsAgg._sum.amountDropped ?? new Prisma.Decimal(0);
  const bankDeposits = bankDepositsAgg._sum.amountDropped ?? new Prisma.Decimal(0);
  const changeOrdersReceived = changeAgg._sum.amountDropped ?? new Prisma.Decimal(0);

  const expectedSafeBalance = lastSafe.totalCountedAmount
    .add(safeDrops)
    .sub(bankDeposits)
    .sub(changeOrdersReceived);

  return {
    lastSafeCountAt: lastSafe.timestamp,
    lastSafeCountTotal: lastSafe.totalCountedAmount,
    safeDrops,
    bankDeposits,
    changeOrdersReceived,
    expectedSafeBalance,
  };
}

/**
 * Expected safe balance "right before" a given safe count timestamp.
 * (Uses the last safe_count strictly before `safeCountAt`.)
 */
export async function calcSafeExpectedBalanceBeforeTimestamp(opts: {
  storeId: string;
  safeCountAt: Date;
}): Promise<{
  lastSafeCountAt: Date | null;
  lastSafeCountTotal: Prisma.Decimal;
  expectedSafeBalance: Prisma.Decimal;
}> {
  const { storeId, safeCountAt } = opts;

  const lastSafe = await prisma.cashCount.findFirst({
    where: { storeId, registerId: null, countType: "safe_count", timestamp: { lt: safeCountAt } },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true, totalCountedAmount: true },
  });

  const lowerBound = lastSafe?.timestamp ?? null;

  const [safeDropsAgg, bankDepositsAgg, changeAgg] = await Promise.all([
    prisma.cashDrop.aggregate({
      where: {
        storeId,
        dropType: "safe_drop",
        droppedAt: lowerBound ? { gt: lowerBound, lte: safeCountAt } : { lte: safeCountAt },
      },
      _sum: { amountDropped: true },
    }),
    prisma.cashDrop.aggregate({
      where: {
        storeId,
        dropType: "bank_deposit",
        droppedAt: lowerBound ? { gt: lowerBound, lte: safeCountAt } : { lte: safeCountAt },
      },
      _sum: { amountDropped: true },
    }),
    prisma.cashDrop.aggregate({
      where: {
        storeId,
        dropType: "change_order_received",
        droppedAt: lowerBound ? { gt: lowerBound, lte: safeCountAt } : { lte: safeCountAt },
      },
      _sum: { amountDropped: true },
    }),
  ]);

  const safeDrops = safeDropsAgg._sum.amountDropped ?? new Prisma.Decimal(0);
  const bankDeposits = bankDepositsAgg._sum.amountDropped ?? new Prisma.Decimal(0);
  const changeOrdersReceived = changeAgg._sum.amountDropped ?? new Prisma.Decimal(0);

  const lastSafeTotal = lastSafe?.totalCountedAmount ?? new Prisma.Decimal(0);
  const expectedSafeBalance = lastSafeTotal.add(safeDrops).sub(bankDeposits).sub(changeOrdersReceived);

  return {
    lastSafeCountAt: lastSafe ? lastSafe.timestamp : null,
    lastSafeCountTotal: lastSafeTotal,
    expectedSafeBalance,
  };
}

