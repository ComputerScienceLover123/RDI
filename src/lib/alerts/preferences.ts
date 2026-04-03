import { prisma } from "@/lib/prisma";
import type { NotificationCategory, UserNotificationPreference } from "@prisma/client";

export async function getOrCreateNotificationPreferences(
  userId: string
): Promise<UserNotificationPreference> {
  const existing = await prisma.userNotificationPreference.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.userNotificationPreference.create({
    data: { userId },
  });
}

export function categoryAllowedByPreference(
  prefs: UserNotificationPreference,
  category: NotificationCategory
): boolean {
  switch (category) {
    case "low_stock":
      return prefs.lowStock;
    case "void_alert":
      return prefs.voidAlert;
    case "delivery":
      return prefs.delivery;
    case "audit":
      return prefs.auditReminder;
    case "shrinkage":
      return prefs.shrinkage;
    case "system":
      return prefs.system;
    case "fuel_tank":
      return prefs.fuelTank;
    case "foodservice":
      return prefs.foodservice;
    default:
      return true;
  }
}
