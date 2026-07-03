import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getShipmentProgress, STATUS_LABELS } from "@/lib/shipping";
import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import {
  Package,
  Receipt,
  Users,
  Euro,
  Truck,
  AlertTriangle,
  ArrowRight,
  TicketPercent,
  Megaphone,
  BarChart3,
  Trophy,
} from "lucide-react";

export default async function AdminDashboard() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [productCount, userCount, orders, lowStock, ordersToday, openReturns, openQuestions, criticalStock] =
    await Promise.all([
      prisma.product.count(),
      prisma.user.count(),
      prisma.order.findMany({
        include: { user: true, items: true },
        orderBy: { placedAt: "desc" },
      }),
      prisma.product.findMany({
        where: { stock: { lt: 10 } },
        orderBy: { stock: "asc" },
        take: 8,
      }),
      prisma.order.count({ where: { placedAt: { gte: todayStart } } }),
      prisma.returnRequest.count({ where: { status: "REQUESTED" } }),
      prisma.productQuestion.count({ where: { answer: null } }),
      prisma.product.count({ where: { stock: { lt: 5 } } }),
    ]);

  // Stornierte Bestellungen fließen nicht in Umsatz/Statistiken ein.
  const activeOrders = orders.filter((o) => o.status !== "CANCELLED");
  const revenue = activeOrders.reduce((s, o) => s + o.total, 0);
  const withProgress = activeOrders.map((o) => ({ order: o, progress: getShipmentProgress(o) }));
  const openDeliveries = withProgress.filter((w) => w.progress.currentStatus !== "DELIVERED").length;
  const recent = withProgress.slice(0, 5);

  // Umsatz der letzten 14 Tage (pro Kalendertag, ohne stornierte Bestellungen).
  const days: { key: string; label: string; total: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({
      key: d.toDateString(),
      label: d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }),
      total: 0,
    });
  }
  const byDay = new Map(days.map((d) => [d.key, d]));
  for (const o of activeOrders) {
    const day = byDay.get(new Date(o.placedAt).toDateString());
    if (day) day.total += o.total;
  }
  const maxDay = Math.max(...days.map((d) => d.total), 0.01);

  // Topseller: Top 5 nach verkaufter Stückzahl (Summe der OrderItem-Mengen).
  const sellerMap = new Map<string, { name: string; productId: string | null; quantity: number; revenue: number }>();
  for (const o of activeOrders) {
    for (const item of o.items) {
      const key = item.productId ?? item.productName;
      const entry = sellerMap.get(key) ?? { name: item.productName, productId: item.productId, quantity: 0, revenue: 0 };
      entry.quantity += item.quantity;
      entry.revenue += item.priceAtPurchase * item.quantity;
      sellerMap.set(key, entry);
    }
  }
  const topSellers = [...sellerMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[#1c1c1f]">Dashboard</h1>
        <p className="text-sm text-[#6b6b76]">Überblick über Shop, Bestellungen und Lager.</p>
      </div>

      {/* Hinweise: nur anzeigen, wenn es etwas zu tun gibt */}
      {(ordersToday > 0 || openReturns > 0 || openQuestions > 0 || criticalStock > 0) && (
        <div className="space-y-2">
          {ordersToday > 0 && (
            <AlertBanner
              href="/admin/orders"
              tone="green"
              text={`${ordersToday} neue Bestellung${ordersToday === 1 ? "" : "en"} heute`}
            />
          )}
          {openReturns > 0 && (
            <AlertBanner
              href="/admin/orders"
              tone="orange"
              text={`${openReturns} offene Rücksendung${openReturns === 1 ? "" : "en"} wartet${openReturns === 1 ? "" : "en"} auf Abschluss`}
            />
          )}
          {openQuestions > 0 && (
            <AlertBanner
              href="/admin/questions"
              tone="orange"
              text={`${openQuestions} unbeantwortete Produktfrage${openQuestions === 1 ? "" : "n"}`}
            />
          )}
          {criticalStock > 0 && (
            <AlertBanner
              href="/admin/products"
              tone="red"
              text={`${criticalStock} Produkt${criticalStock === 1 ? "" : "e"} mit kritischem Lagerbestand (unter 5 Stück)`}
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Stat icon={<Package size={18} />} label="Produkte" value={productCount} href="/admin/products" />
        <Stat icon={<Receipt size={18} />} label="Bestellungen" value={activeOrders.length} href="/admin/orders" />
        <Stat icon={<Users size={18} />} label="Nutzer" value={userCount} />
        <Stat icon={<Euro size={18} />} label="Gesamtumsatz" value={`${revenue.toFixed(2)} €`} />
        <Stat icon={<Truck size={18} />} label="Offene Lieferungen" value={openDeliveries} href="/admin/orders" />
      </div>

      {/* Umsatz & Topseller */}
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 bg-white border border-[#e5e5e8] rounded-2xl p-4">
          <h2 className="font-bold mb-4 flex items-center gap-2 text-[#1c1c1f]">
            <BarChart3 size={18} className="text-[#ff5a1f]" /> Umsatz letzte 14 Tage
          </h2>
          <div className="flex items-end gap-1.5 h-36">
            {days.map((d) => (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full justify-end">
                <span className="text-[10px] text-[#6b6b76] tabular-nums">{d.total > 0 ? d.total.toFixed(0) : ""}</span>
                <div
                  className={`w-full rounded-t-md ${d.total > 0 ? "bg-[#ff5a1f]" : "bg-[#f4f4f5]"}`}
                  style={{ height: `${Math.max(d.total > 0 ? 6 : 2, Math.round((d.total / maxDay) * 100))}%` }}
                  title={`${d.label}: ${d.total.toFixed(2)} €`}
                />
                <span className="text-[10px] text-[#6b6b76] whitespace-nowrap">{d.label}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#6b6b76] mt-2">Ohne stornierte Bestellungen.</p>
        </div>

        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4">
          <h2 className="font-bold mb-3 flex items-center gap-2 text-[#1c1c1f]">
            <Trophy size={18} className="text-[#ff5a1f]" /> Topseller
          </h2>
          {topSellers.length === 0 ? (
            <p className="text-sm text-[#6b6b76]">Noch keine Verkäufe.</p>
          ) : (
            <ol className="text-sm divide-y divide-[#e5e5e8]">
              {topSellers.map((t, i) => (
                <li key={t.productId ?? t.name} className="flex items-center gap-2 py-2">
                  <span className="w-5 h-5 rounded-full bg-[#f4f4f5] text-[#6b6b76] text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  {t.productId ? (
                    <Link href={`/admin/products/${t.productId}`} className="flex-1 truncate text-[#1c1c1f] hover:text-[#ff5a1f]">
                      {t.name}
                    </Link>
                  ) : (
                    <span className="flex-1 truncate text-[#1c1c1f]">{t.name}</span>
                  )}
                  <span className="text-xs text-[#6b6b76] shrink-0">
                    {t.quantity} Stk. · <span className="text-[#1faa59] font-semibold">{t.revenue.toFixed(2)} €</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-[#e5e5e8] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5e8]">
            <h2 className="font-bold flex items-center gap-2 text-[#1c1c1f]">
              <Receipt size={18} /> Letzte Bestellungen
            </h2>
            <Link href="/admin/orders" className="text-sm text-[#ff5a1f] font-medium flex items-center gap-1">
              Alle ansehen <ArrowRight size={14} />
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="p-4 text-sm text-[#6b6b76]">Noch keine Bestellungen.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f7f7f8] text-left text-[#6b6b76]">
                  <tr>
                    <th className="px-4 py-2 font-medium">Bestellung</th>
                    <th className="px-4 py-2 font-medium">Kunde</th>
                    <th className="px-4 py-2 font-medium">Summe</th>
                    <th className="px-4 py-2 font-medium">Status (live)</th>
                    <th className="px-4 py-2 font-medium">Datum</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map(({ order, progress }) => (
                    <tr key={order.id} className="border-t border-[#e5e5e8]">
                      <td className="px-4 py-2.5 font-medium text-[#1c1c1f]">#{order.id.slice(-6).toUpperCase()}</td>
                      <td className="px-4 py-2.5 text-[#6b6b76]">{order.user.name || order.user.email}</td>
                      <td className="px-4 py-2.5">{order.total.toFixed(2)} €</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-lg text-xs font-medium ${
                            progress.currentStatus === "DELIVERED"
                              ? "bg-[#1faa59]/10 text-[#1faa59]"
                              : "bg-[#ff5a1f]/10 text-[#ff5a1f]"
                          }`}
                        >
                          {STATUS_LABELS[progress.currentStatus]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[#6b6b76]">{order.placedAt.toLocaleDateString("de-DE")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4">
            <h2 className="font-bold mb-3 flex items-center gap-2 text-[#1c1c1f]">
              <AlertTriangle size={18} className="text-[#ff5a1f]" /> Niedriger Lagerbestand
            </h2>
            {lowStock.length === 0 ? (
              <p className="text-sm text-[#6b6b76]">Alle Produkte ausreichend auf Lager.</p>
            ) : (
              <ul className="text-sm divide-y divide-[#e5e5e8]">
                {lowStock.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 py-2">
                    <span className="w-7 h-7 rounded-lg bg-[#f4f4f5] flex items-center justify-center overflow-hidden shrink-0">
                      <ProductImage image={p.image} className="w-full h-full object-cover flex items-center justify-center text-sm" />
                    </span>
                    <Link href={`/admin/products/${p.id}`} className="flex-1 truncate hover:text-[#ff5a1f]">
                      {p.name}
                    </Link>
                    <span className={`text-xs font-semibold ${p.stock === 0 ? "text-red-600" : "text-[#ff5a1f]"}`}>
                      {p.stock === 0 ? "Ausverkauft" : `${p.stock} Stk.`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4">
            <h2 className="font-bold mb-3 text-[#1c1c1f]">Schnellzugriff</h2>
            <div className="grid grid-cols-2 gap-2">
              <QuickLink href="/admin/products" icon={<Package size={16} />} label="Produkte" />
              <QuickLink href="/admin/orders" icon={<Truck size={16} />} label="Bestellungen" />
              <QuickLink href="/admin/coupons" icon={<TicketPercent size={16} />} label="Gutscheine" />
              <QuickLink href="/admin/ads" icon={<Megaphone size={16} />} label="Werbung" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AlertBanner({ href, text, tone }: { href: string; text: string; tone: "green" | "orange" | "red" }) {
  const tones = {
    green: "bg-[#1faa59]/10 border-[#1faa59]/30 text-[#1faa59]",
    orange: "bg-[#ff5a1f]/10 border-[#ff5a1f]/30 text-[#ff5a1f]",
    red: "bg-red-50 border-red-200 text-red-600",
  } as const;
  return (
    <Link
      href={href}
      className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-sm font-medium ${tones[tone]}`}
    >
      <AlertTriangle size={15} className="shrink-0" />
      <span className="flex-1">{text}</span>
      <ArrowRight size={14} className="shrink-0" />
    </Link>
  );
}

function Stat({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string | number; href?: string }) {
  const inner = (
    <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4 h-full hover:border-[#ff5a1f]/40 transition-colors">
      <div className="flex items-center gap-2 text-[#6b6b76] mb-1.5">
        <span className="text-[#ff5a1f]">{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-xl font-extrabold text-[#1c1c1f]">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-3 py-2 bg-[#f7f7f8] border border-[#e5e5e8] rounded-xl text-sm font-medium text-[#1c1c1f] hover:border-[#ff5a1f] hover:text-[#ff5a1f] transition-colors"
    >
      {icon} {label}
    </Link>
  );
}
