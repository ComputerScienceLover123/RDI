import type { UserRole } from "@prisma/client";
import type { User } from "@prisma/client";

export function canAdministerStores(role: UserRole) {
  return role === "admin";
}

export function canManageStore(role: UserRole) {
  return role === "admin" || role === "manager";
}

export function canEditInventory(role: UserRole) {
  return role === "admin" || role === "manager";
}

export function canEditOrders(role: UserRole) {
  return role === "admin" || role === "manager";
}

export function isEmployeeReadOnly(role: UserRole) {
  return role === "employee";
}

export function isAccessToStoreAllowed(user: Pick<User, "role" | "assignedStoreId">, storeId: string | null) {
  if (user.role === "admin") return true;
  if (!storeId) return false;
  return user.assignedStoreId === storeId;
}

