import type { User } from "@prisma/client";

export function canAccessStore(user: Pick<User, "role" | "assignedStoreId">, storeId: string): boolean {
  if (user.role === "admin") return true;
  return user.assignedStoreId === storeId;
}

export function canPerformInventoryAudit(role: User["role"]): boolean {
  return role === "admin" || role === "manager";
}
