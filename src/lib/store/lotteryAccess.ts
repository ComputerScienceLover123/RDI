import type { User } from "@prisma/client";

type UserSlice = Pick<User, "role" | "assignedStoreId" | "accountStatus">;

export function canViewLottery(user: UserSlice, storeId: string): boolean {
  if (user.accountStatus !== "active") return false;
  if (user.role === "admin") return true;
  return user.assignedStoreId === storeId;
}

/** Activate packs, settle, inventory CRUD, settlement history, reporting at store. */
export function canManageLottery(user: UserSlice, storeId: string): boolean {
  if (user.accountStatus !== "active") return false;
  if (user.role === "admin") return true;
  return user.role === "manager" && user.assignedStoreId === storeId;
}

export function canAdminLottery(user: UserSlice): boolean {
  return user.accountStatus === "active" && user.role === "admin";
}
