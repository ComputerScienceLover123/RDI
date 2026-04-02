import { prisma } from "../prisma";

export async function logLoginAttempt(params: {
  userId: string | null;
  ipAddress: string;
  mfaUsed: boolean;
  success: boolean;
}) {
  await prisma.loginAttempt.create({
    data: {
      userId: params.userId,
      ipAddress: params.ipAddress,
      mfaUsed: params.mfaUsed,
      success: params.success,
    },
  });
}

