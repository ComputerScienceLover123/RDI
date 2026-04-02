import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/serverUser";
import { prisma } from "@/lib/prisma";
import { endOfLocalDay, startOfLocalDay } from "@/lib/sales/dates";
import { decN } from "@/lib/sales/money";

export default async function AdminSalesPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/admin/sales");
  if (user.role !== "admin") redirect("/unauthorized");
  if (user.forcePasswordChange) redirect("/password-change");

  const now = new Date();
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

  const stores = await prisma.store.findMany({ orderBy: { name: "asc" } });

  const rows = await Promise.all(
    stores.map(async (s) => {
      const [todayAgg, mtdAgg, todaySaleCount] = await Promise.all([
        prisma.posTransaction.aggregate({
          where: { storeId: s.id, type: "sale", transactionAt: { gte: todayStart, lte: todayEnd } },
          _sum: { total: true },
        }),
        prisma.posTransaction.aggregate({
          where: { storeId: s.id, type: "sale", transactionAt: { gte: monthStart, lte: todayEnd } },
          _sum: { total: true },
        }),
        prisma.posTransaction.count({
          where: { storeId: s.id, type: "sale", transactionAt: { gte: todayStart, lte: todayEnd } },
        }),
      ]);
      return {
        storeId: s.id,
        storeName: s.name,
        todaySales: decN(todayAgg._sum.total),
        mtdSales: decN(mtdAgg._sum.total),
        todayTxnCount: todaySaleCount,
      };
    })
  );

  function money(n: number) {
    return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <p style={{ marginBottom: 16 }}>
        <Link href="/store" style={{ color: "#2563eb" }}>
          ← Stores
        </Link>
      </p>
      <h1 style={{ marginTop: 0 }}>Admin: Sales comparison</h1>
      <p style={{ opacity: 0.8 }}>
        Today and month-to-date figures use the server local calendar. Open a store for full reporting.
      </p>
      <div style={{ overflowX: "auto", marginTop: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #ccc" }}>
              <th style={{ padding: "10px 8px" }}>Store</th>
              <th style={{ padding: "10px 8px" }}>Today sales</th>
              <th style={{ padding: "10px 8px" }}>Today transactions</th>
              <th style={{ padding: "10px 8px" }}>MTD sales</th>
              <th style={{ padding: "10px 8px" }}>Drill down</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.storeId} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "10px 8px" }}>{r.storeName}</td>
                <td style={{ padding: "10px 8px" }}>{money(r.todaySales)}</td>
                <td style={{ padding: "10px 8px" }}>{r.todayTxnCount}</td>
                <td style={{ padding: "10px 8px" }}>{money(r.mtdSales)}</td>
                <td style={{ padding: "10px 8px" }}>
                  <Link href={`/store/${encodeURIComponent(r.storeId)}/sales`} style={{ color: "#2563eb" }}>
                    Sales dashboard
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
