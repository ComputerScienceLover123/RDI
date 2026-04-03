import type { HqReportStoreScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function resolveStoreIds(
  scope: HqReportStoreScope,
  storeIdsJson: unknown,
): Promise<string[] | { error: string }> {
  const all = await prisma.store.findMany({ select: { id: true } });
  const allIds = all.map((s) => s.id);

  if (scope === "all") return allIds;

  const arr = Array.isArray(storeIdsJson) ? storeIdsJson.map(String) : [];
  if (scope === "single") {
    if (arr.length !== 1) return { error: "single store scope requires exactly one store id" };
    if (!allIds.includes(arr[0]!)) return { error: "invalid store id" };
    return [arr[0]!];
  }

  if (scope === "subset") {
    if (arr.length === 0) return { error: "subset requires at least one store id" };
    const set = new Set(allIds);
    for (const id of arr) {
      if (!set.has(id)) return { error: `invalid store id: ${id}` };
    }
    return arr;
  }

  return { error: "invalid scope" };
}
