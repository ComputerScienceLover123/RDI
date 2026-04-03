import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";
import { canManageProductionPlan } from "@/lib/store/foodserviceAccess";
import { menuItemsVisibleWhere } from "@/lib/foodservice/menuFilter";
import { avgSoldSameWeekday } from "@/lib/foodservice/stats";
import { utcNoonFromYmd } from "@/lib/fuel/dates";
import { formatLocalYMD, startOfLocalDay } from "@/lib/sales/dates";

export const runtime = "nodejs";

const putBody = z.object({
  planDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z.array(
    z.object({
      menuItemId: z.string(),
      quantityFinal: z.number().int().min(0),
    }),
  ),
});

export async function GET(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canManageProductionPlan(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const raw = req.nextUrl.searchParams.get("date")?.trim();
  const ymd = raw || formatLocalYMD(new Date());
  const planDate = utcNoonFromYmd(ymd);

  let plan = await prisma.productionPlan.findUnique({
    where: { storeId_planDate: { storeId, planDate } },
    include: { lines: { include: { menuItem: true } } },
  });

  const menuWhere = { storeId, ...menuItemsVisibleWhere(store.hatchEnabled) };

  if (!plan) {
    plan = await prisma.productionPlan.create({
      data: { storeId, planDate, status: "draft" },
      include: { lines: { include: { menuItem: true } } },
    });
  }

  if (plan.status === "draft" && plan.lines.length === 0) {
    const items = await prisma.foodserviceMenuItem.findMany({ where: menuWhere });
    const today = startOfLocalDay(new Date());
    for (const m of items) {
      const avg = await avgSoldSameWeekday(storeId, m.id, 4, today);
      const suggested = Math.max(0, Math.ceil(avg));
      const qf = suggested < 1 ? 1 : suggested;
      await prisma.productionPlanLine.create({
        data: {
          planId: plan.id,
          menuItemId: m.id,
          quantitySuggested: qf,
          quantityFinal: qf,
        },
      });
    }
    plan = await prisma.productionPlan.findUniqueOrThrow({
      where: { id: plan.id },
      include: { lines: { include: { menuItem: true } } },
    });
  }

  return NextResponse.json({
    plan: {
      id: plan!.id,
      planDate: ymd,
      status: plan!.status,
      confirmedAt: plan!.confirmedAt?.toISOString() ?? null,
      lines: plan!.lines.map((l) => ({
        id: l.id,
        menuItemId: l.menuItemId,
        itemName: l.menuItem.itemName,
        quantitySuggested: l.quantitySuggested,
        quantityFinal: l.quantityFinal,
      })),
    },
  });
}

export async function PUT(req: NextRequest, { params }: { params: { storeId: string } }) {
  const claims = await getSessionClaims();
  if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user || user.accountStatus !== "active") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const storeId = params.storeId;
  if (!canManageProductionPlan(user, storeId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = putBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const planDate = utcNoonFromYmd(parsed.data.planDate);
  const plan = await prisma.productionPlan.findUnique({
    where: { storeId_planDate: { storeId, planDate } },
  });
  if (!plan || plan.status !== "draft") {
    return NextResponse.json({ error: "Plan not found or already confirmed" }, { status: 400 });
  }

  for (const line of parsed.data.lines) {
    await prisma.productionPlanLine.updateMany({
      where: { planId: plan.id, menuItemId: line.menuItemId },
      data: { quantityFinal: line.quantityFinal },
    });
  }

  const updated = await prisma.productionPlan.findUniqueOrThrow({
    where: { id: plan.id },
    include: { lines: { include: { menuItem: true } } },
  });

  return NextResponse.json({
    plan: {
      id: updated.id,
      planDate: parsed.data.planDate,
      status: updated.status,
      lines: updated.lines.map((l) => ({
        menuItemId: l.menuItemId,
        itemName: l.menuItem.itemName,
        quantitySuggested: l.quantitySuggested,
        quantityFinal: l.quantityFinal,
      })),
    },
  });
}
