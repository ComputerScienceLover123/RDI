import { prisma } from "@/lib/prisma";
import { getSessionClaims } from "@/lib/auth/session.server";

export async function getServerUser() {
  const claims = await getSessionClaims();
  if (!claims) return null;
  const user = await prisma.user.findUnique({ where: { id: claims.sub } });
  if (!user) return null;
  return user;
}

