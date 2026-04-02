import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStoreSalesUser } from "@/lib/sales/salesRoute";

export const runtime = "nodejs";

/** Staff assigned to the store (for transaction log filters). */
export async function GET(_req: Request, { params }: { params: { storeId: string } }) {
  const auth = await requireStoreSalesUser(params.storeId);
  if (!auth.ok) return auth.response;

  const users = await prisma.user.findMany({
    where: { assignedStoreId: params.storeId, accountStatus: "active" },
    select: { id: true, firstName: true, lastName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return NextResponse.json({
    staff: users.map((u) => ({
      id: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
    })),
  });
}
