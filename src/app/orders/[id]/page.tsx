import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import ProductImage from "@/components/ProductImage";
import LevelUpConfetti from "@/components/LevelUpConfetti";
import { Receipt, Package, Truck, Bike, Home as HomeIcon } from "lucide-react";

const STEPS = [
  { key: "PLACED", label: "Bestätigt", icon: Receipt, at: 0 },
  { key: "PACKED", label: "Verpackt", icon: Package, at: 0.15 },
  { key: "SHIPPED", label: "Versendet", icon: Truck, at: 0.4 },
  { key: "OUT_FOR_DELIVERY", label: "Unterwegs", icon: Bike, at: 0.75 },
  { key: "DELIVERED", label: "Zugestellt", icon: HomeIcon, at: 1 },
];

function deriveStatus(placedAt: Date, estMin: Date, estMax: Date, stored: string) {
  // Fiktiver Fortschritt: Status leitet sich aus verstrichener Zeit ab, falls Admin ihn nicht manuell gesetzt hat.
  if (stored !== "PLACED") return { status: stored, ratio: 1 };
  const now = Date.now();
  const totalSpan = estMax.getTime() - placedAt.getTime();
  const elapsed = now - placedAt.getTime();
  const ratio = totalSpan > 0 ? Math.min(Math.max(elapsed / totalSpan, 0), 1) : 1;

  let status = "PLACED";
  for (const s of STEPS) {
    if (ratio >= s.at) status = s.key;
  }
  return { status, ratio };
}

function msUntil(target: number) {
  return target - Date.now();
}

function formatDuration(ms: number) {
  if (ms <= 0) return "in Kürze";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (days > 0) return `${days} Tag${days > 1 ? "e" : ""}, ${remHours} Std.`;
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours} Std. ${minutes} Min.`;
}

export default async function OrderDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ levelup?: string }>;
}) {
  const { id } = await props.params;
  const { levelup } = await props.searchParams;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(`/login?callbackUrl=/orders/${id}`);

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { product: true } } },
  });

  if (!order || order.userId !== userId) notFound();

  const { status: effectiveStatus, ratio } = deriveStatus(order.placedAt, order.estDeliveryMin, order.estDeliveryMax, order.status);
  const currentIndex = STEPS.findIndex((s) => s.key === effectiveStatus);
  const nextStep = STEPS[currentIndex + 1];

  const totalSpan = order.estDeliveryMax.getTime() - order.placedAt.getTime();
  const msUntilNext = nextStep ? msUntil(order.placedAt.getTime() + nextStep.at * totalSpan) : 0;
  const msUntilDelivery = msUntil(order.estDeliveryMax.getTime());

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {levelup && <LevelUpConfetti rank={levelup} />}
      <h1 className="text-2xl font-bold mb-1">Bestellung #{order.id.slice(-6).toUpperCase()}</h1>
      <p className="text-sm text-[#6b6b76] mb-6">
        Aufgegeben am {order.placedAt.toLocaleDateString("de-DE")} um{" "}
        {order.placedAt.toLocaleTimeString("de-DE")}
      </p>

      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6 mb-6">
        <div className="flex justify-between mb-4">
          {STEPS.map((s, i) => {
            const StepIcon = s.icon;
            const isDelivered = s.key === "DELIVERED" && i <= currentIndex;
            return (
              <div key={s.key} className="flex-1 flex flex-col items-center text-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    isDelivered
                      ? "bg-[#1faa59] text-white"
                      : i <= currentIndex
                      ? "bg-[#ff5a1f] text-white glow-accent"
                      : "bg-[#f4f4f5] text-[#6b6b76]"
                  }`}
                >
                  <StepIcon size={18} />
                </div>
                <span
                  className={`text-xs mt-1 ${
                    isDelivered
                      ? "text-[#1faa59] font-semibold"
                      : i <= currentIndex
                      ? "text-[#ff5a1f] font-semibold"
                      : "text-[#6b6b76]"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="w-full h-2 bg-[#f4f4f5] rounded-full overflow-hidden mb-4">
          <div
            className={`h-full ${effectiveStatus === "DELIVERED" ? "bg-[#1faa59]" : "bg-[#ff5a1f]"}`}
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>

        {effectiveStatus !== "DELIVERED" ? (
          <div className="bg-[#f4f4f5] rounded-xl p-3 text-sm space-y-1">
            {nextStep && <p>⏳ Nächster Schritt ({nextStep.label}) in {formatDuration(msUntilNext)}</p>}
            <p className="text-[#1c1c1f]">📅 Zugestellt voraussichtlich in {formatDuration(msUntilDelivery)}</p>
          </div>
        ) : (
          <div className="bg-[#eafbf1] text-[#1faa59] rounded-xl p-3 text-sm font-semibold text-center">
            🎉 Paket zugestellt!
          </div>
        )}
      </div>

      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6 mb-6">
        <h2 className="font-bold mb-3">Lieferadresse</h2>
        <p className="text-sm">{order.shippingName}</p>
        <p className="text-sm text-[#6b6b76] whitespace-pre-line">{order.shippingAddress}</p>
      </div>

      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6">
        <h2 className="font-bold mb-3">Artikel</h2>
        {order.items.map((i) => (
          <div key={i.id} className="flex justify-between items-center gap-3 text-sm py-2">
            <div className="w-10 h-10 rounded-lg bg-[#f4f4f5] flex items-center justify-center overflow-hidden shrink-0">
              <ProductImage image={i.productImage} className="w-full h-full object-cover flex items-center justify-center text-xl" />
            </div>
            <span className="flex-1">{i.productName} × {i.quantity}</span>
            <span>{(i.priceAtPurchase * i.quantity).toFixed(2)} €</span>
          </div>
        ))}
        <div className="flex justify-between font-bold border-t border-[#e5e5e8] mt-2 pt-2">
          <span>Gesamt</span>
          <span className="text-[#ff5a1f]">{order.total.toFixed(2)} €</span>
        </div>
      </div>
    </div>
  );
}
