import type { Decimal } from "@prisma/client/runtime/library";

export function decN(v: Decimal | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "object" && "toNumber" in v ? v.toNumber() : Number(v);
}
