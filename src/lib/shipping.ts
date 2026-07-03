// Simulierte Versandverfolgung: aus placedAt + Lieferfenster wird deterministisch
// eine Sendungs-Timeline berechnet. Es wird nichts wirklich verschickt (Demo).

export type ShipmentStatus =
  | "PLACED"
  | "PACKED"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED";

export type ShipmentStation = {
  key: ShipmentStatus;
  label: string;
  description: string;
  timestamp: Date;
  state: "done" | "current" | "upcoming";
};

export type OrderLike = {
  id: string;
  placedAt: Date;
  estDeliveryMin: Date;
  estDeliveryMax: Date;
  shippingAddress: string;
};

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  PLACED: "Bestellung eingegangen",
  PACKED: "Verpackt",
  SHIPPED: "Versendet",
  IN_TRANSIT: "Im Verteilzentrum",
  OUT_FOR_DELIVERY: "In Zustellung",
  DELIVERED: "Zugestellt",
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Fiktive, deterministische Sendungsnummer aus der Bestell-ID. */
export function getTrackingNumber(orderId: string): string {
  return "VS" + orderId.slice(-10).toUpperCase();
}

/** CH ist am schnellsten, DE/AT (und Rest) brauchen einen Tag länger. */
function countryTransitDelayMs(shippingAddress: string): number {
  const addr = shippingAddress.toLowerCase();
  if (addr.includes("schweiz") || /\bch\b/.test(addr) || addr.includes("switzerland")) return 0;
  if (addr.includes("deutschland") || addr.includes("österreich") || /\b(de|at)\b/.test(addr)) return DAY;
  return 0;
}

export function getShipmentProgress(order: OrderLike, now: Date = new Date()) {
  const placed = order.placedAt.getTime();
  const delay = countryTransitDelayMs(order.shippingAddress);

  // Zustellzeitpunkt: estDeliveryMin (+ evtl. Länder-Verzögerung), nie später als estDeliveryMax
  // und nie früher als ein paar Stunden nach Bestellung.
  const deliveredAt = Math.min(
    Math.max(order.estDeliveryMin.getTime() + delay, placed + 30 * HOUR),
    Math.max(order.estDeliveryMax.getTime(), placed + 30 * HOUR)
  );

  // "In Zustellung" am Morgen des Liefertags (08:00), aber nach dem Verteilzentrum.
  const deliveryMorning = new Date(deliveredAt);
  deliveryMorning.setHours(8, 0, 0, 0);
  const inTransitAt = placed + DAY;
  const outForDeliveryAt = Math.max(deliveryMorning.getTime(), inTransitAt + 2 * HOUR);

  const defs: { key: ShipmentStatus; description: string; at: number }[] = [
    { key: "PLACED", description: "Wir haben deine Bestellung erhalten und bestätigt.", at: placed },
    { key: "PACKED", description: "Deine Artikel wurden im Lager kommissioniert und verpackt.", at: placed + 2 * HOUR },
    { key: "SHIPPED", description: "Das Paket wurde an den Versanddienstleister übergeben.", at: placed + 8 * HOUR },
    { key: "IN_TRANSIT", description: "Das Paket ist im regionalen Verteilzentrum eingetroffen.", at: inTransitAt },
    { key: "OUT_FOR_DELIVERY", description: "Das Paket ist mit dem Zustellfahrzeug unterwegs zu dir.", at: outForDeliveryAt },
    { key: "DELIVERED", description: "Das Paket wurde zugestellt.", at: Math.max(deliveredAt, outForDeliveryAt + 2 * HOUR) },
  ];

  const nowMs = now.getTime();
  let currentIndex = 0;
  defs.forEach((d, i) => {
    if (nowMs >= d.at) currentIndex = i;
  });

  const stations: ShipmentStation[] = defs.map((d, i) => ({
    key: d.key,
    label: STATUS_LABELS[d.key],
    description: d.description,
    timestamp: new Date(d.at),
    state: i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming",
  }));

  const currentStatus = defs[currentIndex].key;
  const totalSpan = defs[defs.length - 1].at - placed;
  const progressRatio =
    currentStatus === "DELIVERED"
      ? 1
      : totalSpan > 0
      ? Math.min(Math.max((nowMs - placed) / totalSpan, 0), 1)
      : 1;

  return {
    stations,
    currentStatus,
    progressRatio,
    trackingNumber: getTrackingNumber(order.id),
    estimatedDelivery: new Date(defs[defs.length - 1].at),
  };
}

export function isShippedOrLater(status: ShipmentStatus): boolean {
  return ["SHIPPED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED"].includes(status);
}
