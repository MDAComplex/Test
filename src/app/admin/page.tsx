import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboard() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const [productCount, userCount, orders, activeShoppers] = await Promise.all([
    prisma.product.count(),
    prisma.user.count(),
    prisma.order.findMany({ include: { items: true }, orderBy: { placedAt: "desc" } }),
    prisma.cartItem.findMany({ distinct: ["userId"], include: { user: true } }),
  ]);

  const revenue = orders.reduce((s, o) => s + o.total, 0);
  const recentOrders = orders.slice(0, 8);

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
        <div className="bg-white border rounded-xl p-4">
          <h2 className="font-bold mb-3">🛒 Aktive Shopper (offener Warenkorb)</h2>
          {activeShoppers.length === 0 ? (
            <p className="text-sm text-gray-400">Aktuell niemand mit Artikeln im Warenkorb.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {activeShoppers.map((c) => (
                <li key={c.userId} className="flex justify-between">
                  <span>{c.user.name || c.user.email}</span>
                  <span className="text-gray-400">{c.user.email}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white border rounded-xl p-4">
          <h2 className="font-bold mb-3">🧾 Letzte Bestellungen</h2>
          {recentOrders.length === 0 ? (
            <p className="text-sm text-gray-400">Noch keine Bestellungen.</p>
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
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white border rounded-xl p-4 text-center">
      <p className="text-2xl font-extrabold text-violet-700">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}
