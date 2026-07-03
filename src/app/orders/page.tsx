import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getShipmentProgress, STATUS_LABELS } from "@/lib/shipping";
import { grantDeliveryRewards } from "@/lib/rewards";
import { Truck, CheckCircle, XCircle } from "lucide-react";

export default async function OrdersPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login?callbackUrl=/orders");

  // Lazy-Check: Lieferboni + Versand-/Zustellbenachrichtigungen nachziehen.
  await grantDeliveryRewards(userId);

  const orders = await prisma.order.findMany({
    where: { userId },
    include: { items: true },
    orderBy: { placedAt: "desc" },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Meine Bestellungen</h1>
      {orders.length === 0 ? (
        <p className="text-[#6b6b76]">Noch keine Bestellungen.</p>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            // Live berechneter Status aus der simulierten Sendungs-Timeline.
            const { currentStatus, trackingNumber } = getShipmentProgress(o);
            const delivered = currentStatus === "DELIVERED";
            const cancelled = currentStatus === "CANCELLED";
            return (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="block bg-[#ffffff] border border-[#e5e5e8] rounded-2xl p-4 hover:border-[#ff5a1f]/50"
              >
                <div className="flex justify-between items-start gap-2">
                  <span className="font-semibold">Bestellung #{o.id.slice(-6).toUpperCase()}</span>
                  <span
                    className={`text-sm px-2 py-1 rounded-full flex items-center gap-1 ${
                      cancelled
                        ? "bg-[#f4f4f5] text-[#6b6b76] border border-[#e5e5e8]"
                        : delivered
                        ? "bg-[#eafbf1] text-[#1faa59]"
                        : "bg-[#fff7ed] text-[#ff5a1f]"
                    }`}
                  >
                    {cancelled ? <XCircle size={13} /> : delivered ? <CheckCircle size={13} /> : <Truck size={13} />}
                    {STATUS_LABELS[currentStatus]}
                  </span>
                </div>
                <p className="text-sm text-[#6b6b76]">
                  {o.items.length} Artikel · {o.total.toFixed(2)} €{!cancelled && ` · Sendung ${trackingNumber}`}
                </p>
                <p className="text-xs text-[#6b6b76]">
                  Aufgegeben am {o.placedAt.toLocaleDateString("de-DE")}
                  {!delivered && !cancelled && ` · Zustellung vsl. bis ${o.estDeliveryMax.toLocaleDateString("de-DE")}`}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
