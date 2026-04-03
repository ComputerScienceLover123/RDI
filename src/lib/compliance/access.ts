import type { User } from "@prisma/client";

export function canViewStoreComplianceDashboard(user: Pick<User, "role" | "assignedStoreId">, storeId: string): boolean {
  if (user.role === "admin") return true;
  if (user.role === "manager" && user.assignedStoreId === storeId) return true;
  return false;
}

export function canUseCompliancePosSim(user: Pick<User, "role" | "assignedStoreId">, storeId: string): boolean {
  if (user.role === "admin") return true;
  if (user.role === "manager" && user.assignedStoreId === storeId) return true;
  return false;
}

/** Employee: own history only; managers/admins use dashboard APIs instead. */
export function canViewOwnComplianceHistory(user: Pick<User, "role" | "assignedStoreId">, storeId: string): boolean {
  if (user.role === "employee" && user.assignedStoreId === storeId) return true;
  return canViewStoreComplianceDashboard(user, storeId);
}
