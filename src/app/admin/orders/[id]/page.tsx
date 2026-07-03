import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateOrderStatus } from "@/lib/actions";
import { getShipmentProgress, getTrackingNumber, STATUS_LABELS, type ShipmentStatus } from "@/lib/shipping";
import ProductImage from "@/components/ProductImage";
import Link from "next/link";
import { ArrowLeft, Truck, MapPin, User, Check, Circle } from "lucide-react";

const STATUSES: ShipmentStatus[] = ["PLACED", "PACKED", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];

export default async function AdminOrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const { id } = await props.params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: { user: true, items: true },
  });
  if (!order) notFound();

  const progress = getShipmentProgress(order);
  const cancelled = progress.currentStatus === "CANCELLED";
  const delivered = progress.currentStatus === "DELIVERED";
  const subtotal = order.items.reduce((s, i) => s + i.priceAtPurchase * i.quantity, 0);
  const coinsDiscount = order.coinsRedeemed / 100;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/orders" className="inline-flex items-center gap-1.5 text-sm text-[#6b6b76] hover:text-[#1c1c1f] mb-2">
          <ArrowLeft size={15} /> Zurück zu den Bestellungen
        </Link>
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-[#1c1c1f]">Bestellung #{order.id.slice(-6).toUpperCase()}</h1>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-semibold ${
              cancelled
                ? "bg-red-50 text-red-600"
                : delivered
                ? "bg-[#1faa59]/10 text-[#1faa59]"
                : "bg-[#ff5a1f]/10 text-[#ff5a1f]"
            }`}
          >
            <Truck size={12} /> Live: {STATUS_LABELS[progress.currentStatus]}
          </span>
        </div>
        <p className="text-sm text-[#6b6b76]">
          Bestellt am {order.placedAt.toLocaleDateString("de-DE")},{" "}
          {order.placedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr · Sendung {getTrackingNumber(order.id)}
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          {/* Artikel */}
          <div className="bg-white border border-[#e5e5e8] rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e5e5e8]">
              <h2 className="font-bold text-[#1c1c1f]">Artikel ({order.items.reduce((s, i) => s + i.quantity, 0)})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#f7f7f8] text-left text-[#6b6b76]">
                  <tr>
                    <th className="p-3 font-medium">Artikel</th>
                    <th className="p-3 font-medium text-right">Menge</th>
                    <th className="p-3 font-medium text-right">Einzelpreis</th>
                    <th className="p-3 font-medium text-right">Summe</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-t border-[#e5e5e8]">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="w-9 h-9 rounded-lg bg-[#f4f4f5] flex items-center justify-center overflow-hidden shrink-0">
                            <ProductImage image={item.productImage} className="w-full h-full object-cover flex items-center justify-center text-lg" />
                          </span>
                          {item.productId ? (
                            <Link href={`/admin/products/${item.productId}`} className="font-medium text-[#1c1c1f] hover:text-[#ff5a1f]">
                              {item.productName}
                            </Link>
                          ) : (
                            <span className="font-medium text-[#1c1c1f]">{item.productName}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right">{item.quantity}</td>
                      <td className="p-3 text-right">{item.priceAtPurchase.toFixed(2)} €</td>
                      <td className="p-3 text-right font-medium">{(item.priceAtPurchase * item.quantity).toFixed(2)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-[#e5e5e8] text-sm space-y-1">
              <div className="flex justify-between text-[#6b6b76]">
                <span>Zwischensumme</span>
                <span>{subtotal.toFixed(2)} €</span>
              </div>
              {order.discountAmount > 0 && (
                <div className="flex justify-between text-[#1faa59]">
                  <span>Rabatt{order.couponCode ? ` (Gutschein ${order.couponCode})` : ""}</span>
                  <span>-{order.discountAmount.toFixed(2)} €</span>
                </div>
              )}
              {order.coinsRedeemed > 0 && (
                <div className="flex justify-between text-[#1faa59]">
                  <span>Coins eingelöst ({order.coinsRedeemed})</span>
                  <span>-{coinsDiscount.toFixed(2)} €</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-[#1c1c1f] pt-1 border-t border-[#e5e5e8]">
                <span>Gesamt</span>
                <span>{order.total.toFixed(2)} €</span>
              </div>
            </div>
          </div>

          {/* Sendungsverlauf */}
          <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4">
            <h2 className="font-bold mb-3 flex items-center gap-2 text-[#1c1c1f]">
              <Truck size={18} /> Sendungsverlauf
            </h2>
            {cancelled ? (
              <p className="text-sm text-red-600">Diese Bestellung wurde storniert — es gibt keine Sendungsverfolgung.</p>
            ) : (
              <ol className="space-y-2">
                {progress.stations.map((st) => (
                  <li key={st.key} className="flex items-center gap-2.5 text-sm">
                    {st.state === "upcoming" ? (
                      <Circle size={15} className="text-[#e5e5e8] shrink-0" />
                    ) : (
                      <span
                        className={`w-[15px] h-[15px] rounded-full flex items-center justify-center shrink-0 ${
                          st.state === "current" ? "bg-[#ff5a1f]" : "bg-[#1faa59]"
                        }`}
                      >
                        <Check size={10} className="text-white" />
                      </span>
                    )}
                    <span className={st.state === "upcoming" ? "text-[#6b6b76]" : "font-medium text-[#1c1c1f]"}>{st.label}</span>
                    <span className="text-xs text-[#6b6b76] ml-auto">
                      {st.timestamp.toLocaleDateString("de-DE")},{" "}
                      {st.timestamp.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Kunde & Adresse */}
          <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4 space-y-4">
            <div>
              <h2 className="font-bold mb-2 flex items-center gap-2 text-[#1c1c1f]">
                <User size={16} /> Kunde
              </h2>
              <p className="text-sm text-[#1c1c1f]">{order.user.name || "—"}</p>
              <p className="text-sm text-[#6b6b76]">{order.user.email}</p>
            </div>
            <div>
              <h2 className="font-bold mb-2 flex items-center gap-2 text-[#1c1c1f]">
                <MapPin size={16} /> Lieferadresse
              </h2>
              <p className="text-sm text-[#1c1c1f]">{order.shippingName}</p>
              <p className="text-sm text-[#6b6b76] whitespace-pre-line">{order.shippingAddress}</p>
            </div>
            <div className="text-xs text-[#6b6b76]">
              Sendungsnummer: <span className="font-mono text-[#1c1c1f]">{getTrackingNumber(order.id)}</span>
            </div>
          </div>

          {/* Status-Override */}
          <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4">
            <h2 className="font-bold mb-1 text-[#1c1c1f]">Status manuell setzen</h2>
            <p className="text-xs text-[#6b6b76] mb-3">
              Gespeichert: {STATUS_LABELS[order.status as ShipmentStatus] ?? order.status}. Der Live-Status wird aus dem Bestelldatum berechnet.
            </p>
            <form
              action={async (fd) => {
                "use server";
                await updateOrderStatus(order.id, String(fd.get("status")));
              }}
              className="flex items-center gap-2"
            >
              <select name="status" defaultValue={order.status} className="flex-1 bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-2 py-1.5 text-sm">
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <button className="text-sm bg-[#ff5a1f] text-white px-3 py-1.5 rounded-lg font-medium">Setzen</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
