import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";

const STEPS = [
  { key: "PLACED", label: "Bestellt", emoji: "🧾" },
  { key: "PACKED", label: "Verpackt", emoji: "📦" },
  { key: "SHIPPED", label: "Versendet", emoji: "🚚" },
  { key: "OUT_FOR_DELIVERY", label: "Wird zugestellt", emoji: "🛵" },
  { key: "DELIVERED", label: "Zugestellt", emoji: "🏠" },
];

function deriveStatus(placedAt: Date, estMin: Date, estMax: Date, stored: string) {
  // Fiktiver Fortschritt: Status leitet sich aus verstrichener Zeit ab, falls Admin ihn nicht manuell gesetzt hat.
  if (stored !== "PLACED") return stored;
  const now = Date.now();
  const totalSpan = estMax.getTime() - placedAt.getTime();
  const elapsed = now - placedAt.getTime();
  const ratio = totalSpan > 0 ? elapsed / totalSpan : 1;
  if (ratio >= 1) return "DELIVERED";
  if (ratio >= 0.75) return "OUT_FOR_DELIVERY";
  if (ratio >= 0.4) return "SHIPPED";
  if (ratio >= 0.1) return "PACKED";
  return "PLACED";
}

export default async function OrderDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(`/login?callbackUrl=/orders/${id}`);

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { product: true } } },
  });

  if (!order || order.userId !== userId) notFound();

  const effectiveStatus = deriveStatus(order.placedAt, order.estDeliveryMin, order.estDeliveryMax, order.status);
  const currentIndex = STEPS.findIndex((s) => s.key === effectiveStatus);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-1">Bestellung #{order.id.slice(-6).toUpperCase()}</h1>
      <p className="text-sm text-gray-500 mb-6">
        Aufgegeben am {order.placedAt.toLocaleDateString("de-DE")} um{" "}
        {order.placedAt.toLocaleTimeString("de-DE")}
      </p>

      <div className="bg-white border rounded-xl p-6 mb-6">
        <div className="flex justify-between mb-4">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex-1 flex flex-col items-center text-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
                  i <= currentIndex ? "bg-violet-700 text-white" : "bg-gray-100 text-gray-400"
                }`}
              >
                {s.emoji}
              </div>
              <span className={`text-xs mt-1 ${i <= currentIndex ? "text-violet-700 font-semibold" : "text-gray-400"}`}>
                {s.label}
              </span>
            </div>
          ))}
        </div>
        <div className="bg-violet-50 rounded-lg p-3 text-sm text-violet-800">
          📅 Voraussichtliche Lieferung: {order.estDeliveryMin.toLocaleDateString("de-DE")} – {order.estDeliveryMax.toLocaleDateString("de-DE")}
        </div>
      </div>

      <div className="bg-white border rounded-xl p-6 mb-6">
        <h2 className="font-bold mb-3">Lieferadresse</h2>
        <p className="text-sm">{order.shippingName}</p>
        <p className="text-sm text-gray-600 whitespace-pre-line">{order.shippingAddress}</p>
      </div>

      <div className="bg-white border rounded-xl p-6">
        <h2 className="font-bold mb-3">Artikel</h2>
        {order.items.map((i) => (
          <div key={i.id} className="flex justify-between text-sm py-1">
            <span>{i.product.image} {i.product.name} × {i.quantity}</span>
            <span>{(i.priceAtPurchase * i.quantity).toFixed(2)} €</span>
          </div>
        ))}
        <div className="flex justify-between font-bold border-t mt-2 pt-2">
          <span>Gesamt</span>
          <span>{order.total.toFixed(2)} €</span>
        </div>
      </div>
    </div>
  );
}
