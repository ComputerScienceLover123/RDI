import type { User } from "@prisma/client";

type UserSlice = Pick<User, "role" | "assignedStoreId" | "accountStatus">;

export function canViewFoodservice(user: UserSlice, storeId: string): boolean {
  if (user.accountStatus !== "active") return false;
  if (user.role === "admin") return true;
  return user.assignedStoreId === storeId;
}

/** Hot case place, dispose, waste log — managers and employees at store; admins anywhere. */
export function canOperateHotCase(user: UserSlice, storeId: string): boolean {
  if (user.accountStatus !== "active") return false;
  if (user.role === "admin") return true;
  if (user.assignedStoreId !== storeId) return false;
  return user.role === "manager" || user.role === "employee";
}

export function canManageProductionPlan(user: UserSlice, storeId: string): boolean {
  if (user.accountStatus !== "active") return false;
  if (user.role === "admin") return true;
  return user.role === "manager" && user.assignedStoreId === storeId;
}

/** Recipe viewer (read-only at store) — managers and admins only. */
export function canViewFoodserviceRecipes(user: UserSlice, storeId: string): boolean {
  if (user.accountStatus !== "active") return false;
  if (user.role === "admin") return true;
  return user.role === "manager" && user.assignedStoreId === storeId;
}

export function canAdminFoodservice(user: UserSlice): boolean {
  return user.accountStatus === "active" && user.role === "admin";
}
