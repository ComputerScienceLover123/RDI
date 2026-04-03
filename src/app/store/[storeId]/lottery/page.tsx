import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import { prisma } from "@/lib/prisma";
import { canManageLottery, canViewLottery } from "@/lib/store/lotteryAccess";
import LotteryClient from "@/components/store/LotteryClient";

export default async function StoreLotteryPage({ params }: { params: { storeId: string } }) {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/store");

  const { storeId } = params;
  if (!canViewLottery(user, storeId)) redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) redirect("/unauthorized");

  return (
    <LotteryClient
      storeId={store.id}
      storeName={store.name}
      canManage={canManageLottery(user, storeId)}
    />
  );
}
