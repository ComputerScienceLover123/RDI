import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canAdminFoodservice } from "@/lib/store/foodserviceAccess";

export const runtime = "nodejs";

const patchSchema = z.object({
  hatchEnabled: z.boolean(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { storeId: string } },
) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  if (!canAdminFoodservice(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const store = await prisma.store.update({
    where: { id: params.storeId },
    data: { hatchEnabled: parsed.data.hatchEnabled },
  });

  return NextResponse.json({ hatchEnabled: store.hatchEnabled });
}
