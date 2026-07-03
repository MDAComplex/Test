import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateOrderStatus } from "@/lib/actions";
import { getShipmentProgress, getTrackingNumber, STATUS_LABELS, type ShipmentStatus } from "@/lib/shipping";
import Link from "next/link";
import { Truck, ArrowRight, Download, RotateCcw } from "lucide-react";

const STATUSES: ShipmentStatus[] = ["PLACED", "PACKED", "SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"];

export default async function AdminOrdersPage() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") redirect("/");

  const [orders, returnRequests] = await Promise.all([
    prisma.order.findMany({
      include: { user: true, items: true },
      orderBy: { placedAt: "desc" },
    }),
    prisma.returnRequest.findMany(),
  ]);
  const openReturnOrderIds = new Set(returnRequests.filter((r) => r.status === "REQUESTED").map((r) => r.orderId));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#1c1c1f]">Bestellungen</h1>
          <p className="text-sm text-[#6b6b76]">
            {orders.length} Bestellungen. Der Live-Status wird aus dem Bestelldatum berechnet; der gespeicherte Status kann manuell überschrieben werden.
          </p>
        </div>
        <a
          href="/admin/orders/export"
          className="flex items-center gap-1.5 px-3 py-2 bg-[#f7f7f8] border border-[#e5e5e8] rounded-xl text-sm font-medium hover:border-[#ff5a1f]"
        >
          <Download size={15} /> Export (CSV)
        </a>
      </div>

      <div className="space-y-4">
        {orders.map((o) => {
          const progress = getShipmentProgress(o);
          const delivered = progress.currentStatus === "DELIVERED";
          return (
            <div key={o.id} className="bg-white border border-[#e5e5e8] rounded-2xl p-4">
              <div className="flex justify-between items-start flex-wrap gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/admin/orders/${o.id}`} className="font-semibold text-[#1c1c1f] hover:text-[#ff5a1f]">
                      #{o.id.slice(-6).toUpperCase()}
                    </Link>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold ${
                        delivered ? "bg-[#1faa59]/10 text-[#1faa59]" : "bg-[#ff5a1f]/10 text-[#ff5a1f]"
                      }`}
                    >
                      <Truck size={12} /> Live: {STATUS_LABELS[progress.currentStatus]}
                    </span>
                    {openReturnOrderIds.has(o.id) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-600">
                        <RotateCcw size={12} /> Rücksendung
                      </span>
                    )}
                    <span className="text-xs text-[#6b6b76]">Gespeichert: {STATUS_LABELS[o.status as ShipmentStatus] ?? o.status}</span>
                  </div>
                  <p className="text-sm text-[#6b6b76]">
                    {o.user.name ? `${o.user.name} · ` : ""}{o.user.email}
                  </p>
                  <p className="text-sm text-[#6b6b76]">
                    {o.items.reduce((s, i) => s + i.quantity, 0)} Artikel · {o.total.toFixed(2)} €
                    {o.discountAmount > 0 && (
                      <span className="text-[#1faa59]">
                        {" "}· Rabatt {o.discountAmount.toFixed(2)} €{o.couponCode ? ` (${o.couponCode})` : ""}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[#6b6b76]">
                    Sendung {getTrackingNumber(o.id)} · Bestellt am {o.placedAt.toLocaleDateString("de-DE")}, {o.placedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr
                  </p>
                </div>
                <form
                  action={async (fd) => {
                    "use server";
                    await updateOrderStatus(o.id, String(fd.get("status")));
                  }}
                  className="flex items-center gap-2"
                >
                  <select name="status" defaultValue={o.status} className="bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-2 py-1.5 text-sm">
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button className="text-sm bg-[#ff5a1f] text-white px-3 py-1.5 rounded-lg font-medium">Status setzen</button>
                </form>
              </div>
              <div className="mt-2">
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="inline-flex items-center gap-1 text-sm text-[#ff5a1f] font-medium hover:underline"
                >
                  Details ansehen <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          );
        })}
        {orders.length === 0 && <p className="text-[#6b6b76]">Noch keine Bestellungen.</p>}
      </div>
    </div>
  );
}
