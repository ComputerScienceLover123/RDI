import type { User, UserRole } from "@prisma/client";
import { canAccessStore } from "./storeAccess";

export function canViewPurchaseOrders(user: Pick<User, "role" | "assignedStoreId" | "accountStatus">, storeId: string) {
  if (user.accountStatus !== "active") return false;
  return canAccessStore(user, storeId);
}

export function canManagePurchaseOrders(role: UserRole) {
  return role === "admin" || role === "manager";
}
