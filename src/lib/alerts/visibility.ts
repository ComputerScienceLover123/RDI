import type { Prisma, User } from "@prisma/client";

export function notificationsWhereForInbox(user: Pick<User, "id" | "role">): Prisma.NotificationWhereInput {
  const mine: Prisma.NotificationWhereInput = { recipientUserId: user.id };
  if (user.role === "employee") {
    return {
      AND: [
        mine,
        { severity: "info" },
        { category: { notIn: ["void_alert", "shrinkage"] } },
      ],
    };
  }
  return mine;
}
