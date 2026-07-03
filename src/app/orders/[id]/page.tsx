import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import LevelUpConfetti from "@/components/LevelUpConfetti";
import { getShipmentProgress, isCancellable, type ShipmentStatus } from "@/lib/shipping";
import { COUNTRIES } from "@/lib/countries";
import { geocodeAddress } from "@/lib/geocode";
import DeliveryMapClient from "@/components/DeliveryMapClient";
import { grantDeliveryRewards } from "@/lib/rewards";
import { cancelOrder, reorder, requestReturn } from "@/lib/actions";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  Receipt,
  Package,
  Truck,
  Warehouse,
  MapPin,
  CheckCircle,
  Coins,
  Clock,
  Star,
  XCircle,
  RotateCcw,
  Undo2,
  PackageOpen,
  type LucideIcon,
} from "lucide-react";

const STATION_ICONS: Record<ShipmentStatus, LucideIcon> = {
  PLACED: Receipt,
  PACKED: Package,
  SHIPPED: Truck,
  IN_TRANSIT: Warehouse,
  OUT_FOR_DELIVERY: MapPin,
  DELIVERED: CheckCircle,
};

// Best-effort-Parsing der gespeicherten Adresse ("Straße\nPLZ Ort\nLändername",
// siehe checkout-Action). Liefert null, wenn PLZ/Ort nicht erkennbar sind.
function parseShippingAddress(address: string): { zip: string; city: string; country: string } | null {
  const lines = address.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  // Letzte Zeile: deutscher Ländername → Code (Fallback CH).
  const last = lines[lines.length - 1].toLowerCase();
  const country =
    COUNTRIES.find((c) => c.name.toLowerCase() === last)?.code ??
    COUNTRIES.find((c) => last.includes(c.name.toLowerCase()))?.code ??
    "CH";

  // Zeile mit "PLZ Ort" suchen (PLZ: 3–10 Zeichen aus Ziffern/Buchstaben/-/Leerzeichen).
  for (const line of lines) {
    const m = line.match(/^([A-Za-z0-9][A-Za-z0-9 -]{1,9})\s+(.+)$/);
    if (m && /\d/.test(m[1])) return { zip: m[1].trim(), city: m[2].trim(), country };
  }
  return null;
}

function formatDateTime(d: Date) {
  return `${d.toLocaleDateString("de-DE")} · ${d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`;
}

export default async function OrderDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ levelup?: string; error?: string }>;
}) {
  const { id } = await props.params;
  const { levelup, error } = await props.searchParams;
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect(`/login?callbackUrl=/orders/${id}`);

  // Lazy-Check: Lieferboni gutschreiben + Benachrichtigungen anlegen, bevor die Bestellung geladen wird.
  const granted = await grantDeliveryRewards(userId);
  const justGranted = granted.find((g) => g.orderId === id);

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: { include: { product: true } } },
  });

  if (!order || order.userId !== userId) notFound();

  const { stations, currentStatus, progressRatio, trackingNumber, estimatedDelivery } = getShipmentProgress(order);
  const cancelled = currentStatus === "CANCELLED";
  const returned = currentStatus === "RETURNED";

  // Rücksendung: existiert bereits eine Anmeldung für diese Bestellung?
  const returnRequest = await prisma.returnRequest.findFirst({ where: { orderId: order.id } });

  // Lieferrouten-Karte: Adresse best-effort parsen und geocoden; bei Fehlern keine Karte.
  const parsedAddress = cancelled || returned ? null : parseShippingAddress(order.shippingAddress);
  const routeGeo = parsedAddress
    ? await geocodeAddress(parsedAddress.zip, parsedAddress.city, parsedAddress.country)
    : null;
  const delivered = currentStatus === "DELIVERED";
  const cancellable = isCancellable(currentStatus);
  const subtotal = order.total + order.discountAmount + order.coinsRedeemed / 100;

  // Für "Produkt bewerten": bereits abgegebene Bewertungen des Nutzers.
  const reviewedProductIds = delivered
    ? new Set(
        (
          await prisma.review.findMany({
            where: { userId, productId: { in: order.items.flatMap((i) => (i.productId ? [i.productId] : [])) } },
          })
        ).map((r) => r.productId)
      )
    : new Set<string>();

  async function cancel() {
    "use server";
    try {
      await cancelOrder(id);
    } catch (err) {
      if (isRedirectError(err)) throw err;
      const message = err instanceof Error ? err.message : "Stornierung fehlgeschlagen.";
      redirect(`/orders/${id}?error=${encodeURIComponent(message)}`);
    }
  }

  async function submitReturn(formData: FormData) {
    "use server";
    try {
      await requestReturn(id, formData);
    } catch (err) {
      if (isRedirectError(err)) throw err;
      const message = err instanceof Error ? err.message : "Rücksendung fehlgeschlagen.";
      redirect(`/orders/${id}?error=${encodeURIComponent(message)}`);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {levelup && <LevelUpConfetti rank={levelup} />}
      <h1 className="text-2xl font-bold mb-1">Bestellung #{order.id.slice(-6).toUpperCase()}</h1>
      <p className="text-sm text-[#6b6b76] mb-6">
        Aufgegeben am {order.placedAt.toLocaleDateString("de-DE")} um{" "}
        {order.placedAt.toLocaleTimeString("de-DE")}
      </p>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 mb-6">
          {decodeURIComponent(error)}
        </p>
      )}

      {justGranted && (
        <div className="bg-[#eafbf1] border border-[#bfe9d1] rounded-2xl p-4 mb-6 flex items-center gap-3">
          <Coins size={22} className="text-[#1faa59] shrink-0" />
          <div>
            <p className="font-bold text-[#1faa59]">+{justGranted.coins} Coins gutgeschrieben!</p>
            <p className="text-sm text-[#1c1c1f]">Dein Lieferbonus für diese zugestellte Bestellung.</p>
          </div>
        </div>
      )}

      {returned ? (
        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#f4f4f5] border border-[#e5e5e8] flex items-center justify-center shrink-0">
              <Undo2 size={18} className="text-[#6b6b76]" />
            </div>
            <div>
              <h2 className="font-bold">Zurückgesendet</h2>
              <p className="text-sm text-[#6b6b76]">
                Diese Bestellung wurde zurückgesendet.
                {returnRequest && ` Rückschein: RET-${trackingNumber}.`} Demo: keine echte Rücksendung nötig.
              </p>
            </div>
          </div>
        </div>
      ) : cancelled ? (
        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#f4f4f5] border border-[#e5e5e8] flex items-center justify-center shrink-0">
              <XCircle size={18} className="text-red-500" />
            </div>
            <div>
              <h2 className="font-bold">Bestellung storniert</h2>
              <p className="text-sm text-[#6b6b76]">
                Diese Bestellung wurde storniert — es findet kein Versand statt.
                {order.coinsRedeemed > 0 && ` ${order.coinsRedeemed} eingelöste Coins wurden zurückerstattet.`}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6 mb-6">
          <div className="flex flex-wrap justify-between items-start gap-2 mb-5">
            <div>
              <h2 className="font-bold">Sendungsverfolgung</h2>
              <p className="text-xs text-[#6b6b76]">Sendungsnummer: <span className="font-mono font-semibold text-[#1c1c1f]">{trackingNumber}</span></p>
            </div>
            {!delivered ? (
              <span className="text-xs bg-[#fff7ed] text-[#ff5a1f] border border-[#ffd6c2] px-2 py-1 rounded-full flex items-center gap-1">
                <Clock size={12} /> Zustellung vsl. {estimatedDelivery.toLocaleDateString("de-DE")}
              </span>
            ) : (
              <span className="text-xs bg-[#eafbf1] text-[#1faa59] px-2 py-1 rounded-full flex items-center gap-1">
                <CheckCircle size={12} /> Zugestellt
              </span>
            )}
          </div>

          {/* Vertikale Tracking-Timeline (wie Post/DHL) */}
          <ol className="relative">
            {stations.map((s, i) => {
              const Icon = STATION_ICONS[s.key];
              const isLast = i === stations.length - 1;
              const circle =
                s.state === "done"
                  ? "bg-[#1faa59] text-white"
                  : s.state === "current"
                  ? "bg-[#ff5a1f] text-white glow-accent"
                  : "bg-[#f4f4f5] text-[#6b6b76] border border-[#e5e5e8]";
              return (
                <li key={s.key} className="flex gap-4 pb-1">
                  <div className="flex flex-col items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${circle}`}>
                      <Icon size={18} />
                    </div>
                    {!isLast && (
                      <div className={`w-0.5 flex-1 min-h-8 ${s.state === "done" ? "bg-[#1faa59]" : "bg-[#e5e5e8]"}`} />
                    )}
                  </div>
                  <div className={`pb-6 ${s.state === "upcoming" ? "opacity-60" : ""}`}>
                    <p
                      className={`font-semibold text-sm ${
                        s.state === "current" ? "text-[#ff5a1f]" : s.state === "done" ? "text-[#1faa59]" : "text-[#6b6b76]"
                      }`}
                    >
                      {s.label}
                    </p>
                    <p className="text-xs text-[#6b6b76]">{s.description}</p>
                    <p className="text-xs text-[#6b6b76] mt-0.5">
                      {s.state === "upcoming" ? `Voraussichtlich ${formatDateTime(s.timestamp)}` : formatDateTime(s.timestamp)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          <p className="text-xs text-[#6b6b76] border-t border-[#e5e5e8] pt-3">
            Geschätztes Lieferfenster: {order.estDeliveryMin.toLocaleDateString("de-DE")} –{" "}
            {order.estDeliveryMax.toLocaleDateString("de-DE")}
          </p>

          {parsedAddress && routeGeo && (
            <div className="mt-4">
              <h3 className="font-semibold text-sm mb-2">Lieferroute</h3>
              <DeliveryMapClient
                destLat={routeGeo.lat}
                destLng={routeGeo.lng}
                destLabel={parsedAddress.city}
                progress={progressRatio}
                etaText={`Lieferfenster ${order.estDeliveryMin.toLocaleDateString("de-DE")} – ${order.estDeliveryMax.toLocaleDateString("de-DE")}`}
              />
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6 mb-6">
        <h2 className="font-bold mb-3">Lieferadresse</h2>
        <p className="text-sm">{order.shippingName}</p>
        <p className="text-sm text-[#6b6b76] whitespace-pre-line">{order.shippingAddress}</p>
      </div>

      <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6 mb-6">
        <h2 className="font-bold mb-3">Artikel</h2>
        {order.items.map((i) => (
          <div key={i.id} className="flex justify-between items-center gap-3 text-sm py-2">
            <div className="w-10 h-10 rounded-lg bg-[#f4f4f5] flex items-center justify-center overflow-hidden shrink-0">
              <ProductImage image={i.productImage} className="w-full h-full object-cover flex items-center justify-center text-xl" />
            </div>
            <span className="flex-1">
              {i.productName}
              {i.variant && <span className="text-xs text-[#6b6b76]"> (Größe: {i.variant})</span>} × {i.quantity}
              {delivered && i.productId && !reviewedProductIds.has(i.productId) && (
                <Link
                  href={`/product/${i.productId}#bewerten`}
                  className="ml-2 inline-flex items-center gap-1 text-xs text-[#ff5a1f] font-medium underline"
                >
                  <Star size={12} /> Produkt bewerten
                </Link>
              )}
              {delivered && i.productId && reviewedProductIds.has(i.productId) && (
                <span className="ml-2 text-xs text-[#1faa59]">Bewertet</span>
              )}
            </span>
            <span>{(i.priceAtPurchase * i.quantity).toFixed(2)} €</span>
          </div>
        ))}
        <div className="border-t border-[#e5e5e8] mt-2 pt-2 space-y-1 text-sm">
          {(order.discountAmount > 0 || order.coinsRedeemed > 0) && (
            <div className="flex justify-between text-[#6b6b76]">
              <span>Zwischensumme</span>
              <span>{subtotal.toFixed(2)} €</span>
            </div>
          )}
          {order.discountAmount > 0 && (
            <div className="flex justify-between text-[#1faa59]">
              <span>Gutschein {order.couponCode}</span>
              <span>−{order.discountAmount.toFixed(2)} €</span>
            </div>
          )}
          {order.coinsRedeemed > 0 && (
            <div className="flex justify-between text-[#1faa59]">
              <span>Coins-Rabatt ({order.coinsRedeemed} Coins)</span>
              <span>−{(order.coinsRedeemed / 100).toFixed(2)} €</span>
            </div>
          )}
          <div className="flex justify-between font-bold">
            <span>Gesamt (Warenwert)</span>
            <span className="text-[#ff5a1f]">{order.total.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between font-semibold text-[#1faa59]">
            <span>Bezahlt</span>
            <span>CHF 0.00 (Demo)</span>
          </div>
        </div>
      </div>

      {returnRequest ? (
        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6 mb-6">
          <h2 className="font-bold mb-2 flex items-center gap-2">
            <Undo2 size={18} /> Rücksendung
          </h2>
          <p className="text-sm text-[#1c1c1f]">
            Rücksendung angemeldet – Rückschein:{" "}
            <span className="font-mono font-semibold">RET-{trackingNumber}</span>
          </p>
          <p className="text-sm text-[#6b6b76] mt-1">
            Grund: {returnRequest.reason} · Angemeldet am {returnRequest.createdAt.toLocaleDateString("de-DE")} · Status:{" "}
            {returnRequest.status === "REQUESTED" ? "Angemeldet" : returnRequest.status}
          </p>
          <p className="text-xs text-[#6b6b76] mt-2">Demo: keine echte Rücksendung nötig.</p>
        </div>
      ) : delivered ? (
        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-6 mb-6">
          <h2 className="font-bold mb-2 flex items-center gap-2">
            <PackageOpen size={18} /> Artikel zurücksenden
          </h2>
          <p className="text-sm text-[#6b6b76] mb-3">
            Etwas passt nicht? Melde deine Rücksendung an — du erhältst sofort einen Rückschein-Code.
            Der Lieferbonus dieser Bestellung wird dabei wieder abgezogen.
          </p>
          <form action={submitReturn} className="flex flex-wrap gap-2">
            <select
              name="reason"
              required
              defaultValue=""
              className="flex-1 min-w-48 bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Grund auswählen
              </option>
              <option value="Passt nicht">Passt nicht</option>
              <option value="Gefällt nicht">Gefällt nicht</option>
              <option value="Defekt">Defekt</option>
              <option value="Falscher Artikel">Falscher Artikel</option>
              <option value="Sonstiges">Sonstiges</option>
            </select>
            <button className="flex items-center gap-2 bg-white border border-[#e5e5e8] text-[#1c1c1f] px-4 py-2 rounded-xl text-sm font-semibold hover:border-[#ff5a1f]">
              <Undo2 size={15} /> Rücksendung anmelden
            </button>
          </form>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <form action={async () => { "use server"; await reorder(id); }}>
          <button className="flex items-center gap-2 bg-[#ff5a1f] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90">
            <RotateCcw size={16} /> Erneut bestellen
          </button>
        </form>
        {cancellable && (
          <form action={cancel}>
            <button className="flex items-center gap-2 bg-white border border-[#e5e5e8] text-red-500 px-4 py-2 rounded-lg text-sm font-semibold hover:border-red-300">
              <XCircle size={16} /> Bestellung stornieren
            </button>
          </form>
        )}
      </div>
      {cancellable && (
        <p className="text-xs text-[#6b6b76] mt-2">
          Stornierung ist möglich, solange das Paket noch nicht an die Post übergeben wurde.
        </p>
      )}
    </div>
  );
}
