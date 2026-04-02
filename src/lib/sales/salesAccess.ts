import type { User } from "@prisma/client";

export function canExportSalesData(user: Pick<User, "role">): boolean {
  return user.role === "admin" || user.role === "manager";
}
