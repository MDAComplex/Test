import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ShoppingCart, Receipt, Flame } from "lucide-react";

export default async function AdminDashboard() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const [productCount, userCount, orders, activeShoppers, topItems] = await Promise.all([
    prisma.product.count(),
    prisma.user.count(),
    prisma.order.findMany({ include: { items: true }, orderBy: { placedAt: "desc" } }),
    prisma.cartItem.findMany({ distinct: ["userId"], include: { user: true } }),
    prisma.orderItem.groupBy({
      by: ["productName", "productImage"],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
  ]);

  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const recentOrders = orders.slice(0, 8);

  const topWithCounts = topItems.map((t) => ({
    name: t.productName,
    image: t.productImage,
    qty: t._sum.quantity ?? 0,
  }));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Produkte" value={productCount} />
        <Stat label="Registrierte Nutzer" value={userCount} />
        <Stat label="Bestellungen" value={orders.length} />
        <Stat label="Umsatz (fiktiv)" value={`${revenue.toFixed(2)} €`} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4">
          <h2 className="font-bold mb-3 flex items-center gap-2"><ShoppingCart size={18} /> Aktive Shopper (offener Warenkorb)</h2>
          {activeShoppers.length === 0 ? (
            <p className="text-sm text-[#6b6b76]">Aktuell niemand mit Artikeln im Warenkorb.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {activeShoppers.map((c) => (
                <li key={c.userId} className="flex justify-between">
                  <span>{c.user.name || c.user.email}</span>
                  <span className="text-[#6b6b76]">{c.user.email}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4">
          <h2 className="font-bold mb-3 flex items-center gap-2"><Receipt size={18} /> Letzte Bestellungen</h2>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-[#6b6b76]">Noch keine Bestellungen.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {recentOrders.map((o) => (
                <li key={o.id} className="flex justify-between">
                  <span>#{o.id.slice(-6).toUpperCase()}</span>
                  <span>{o.total.toFixed(2)} €</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4 md:col-span-2">
          <h2 className="font-bold mb-3 flex items-center gap-2"><Flame size={18} /> Beliebteste Artikel</h2>
          {topWithCounts.length === 0 ? (
            <p className="text-sm text-[#6b6b76]">Noch keine Bestelldaten.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {topWithCounts.map((t, i) => (
                <li key={i} className="flex justify-between">
                  <span>{t.image} {t.name}</span>
                  <span>{t.qty}× verkauft</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4 text-center">
      <p className="text-2xl font-extrabold text-[#ff5a1f]">{value}</p>
      <p className="text-xs text-[#6b6b76]">{label}</p>
    </div>
  );
}
