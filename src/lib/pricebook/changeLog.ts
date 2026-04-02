import type { Prisma } from "@prisma/client";

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null && "toString" in v) {
    return String((v as { toString: () => string }).toString());
  }
  return String(v);
}

export async function logProductChange(
  tx: Prisma.TransactionClient,
  args: {
    productId: string;
    changedById: string;
    fieldKey: string;
    oldValue: unknown;
    newValue: unknown;
  }
) {
  await tx.productChangeLog.create({
    data: {
      productId: args.productId,
      changedById: args.changedById,
      fieldKey: args.fieldKey,
      oldValue: str(args.oldValue),
      newValue: str(args.newValue),
    },
  });
}
