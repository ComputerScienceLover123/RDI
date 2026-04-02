import type { User } from "@prisma/client";

type UserSlice = Pick<User, "role" | "assignedStoreId" | "accountStatus">;

export function canViewFuel(user: UserSlice, storeId: string): boolean {
  if (user.accountStatus !== "active") return false;
  if (user.role === "admin") return true;
  return user.assignedStoreId === storeId;
}

export function canLogFuelDelivery(user: UserSlice, storeId: string): boolean {
  if (user.accountStatus !== "active") return false;
  if (user.role === "admin") return true;
  if (user.role === "manager") return user.assignedStoreId === storeId;
  return false;
}

export function canChangeFuelPrice(user: UserSlice, storeId: string): boolean {
  return canLogFuelDelivery(user, storeId);
}
