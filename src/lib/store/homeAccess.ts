import type { User } from "@prisma/client";

type UserSlice = Pick<User, "role" | "accountStatus">;

/** Full manager-style home (KPIs, sales, activity, financial waste). */
export function canViewManagerHomeData(user: UserSlice): boolean {
  return user.accountStatus === "active" && (user.role === "admin" || user.role === "manager");
}
