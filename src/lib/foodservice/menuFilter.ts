import type { Prisma } from "@prisma/client";

export function menuItemsVisibleWhere(hatchEnabled: boolean): Prisma.FoodserviceMenuItemWhereInput {
  return {
    active: true,
    OR: hatchEnabled
      ? [{ brand: "store_brand" }, { brand: "hatch" }]
      : [{ brand: "store_brand" }],
  };
}
