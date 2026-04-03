import type { User } from "@prisma/client";

type UserSlice = Pick<User, "role" | "assignedStoreId" | "accountStatus">;

export function canAdminScanData(user: UserSlice): boolean {
  return user.accountStatus === "active" && user.role === "admin";
}

/** Read-only scan data summary for managers at their assigned store. */
export function canManagerViewStoreScanData(user: UserSlice, storeId: string): boolean {
  if (user.accountStatus !== "active") return false;
  if (user.role === "admin") return true;
  return user.role === "manager" && user.assignedStoreId === storeId;
}
