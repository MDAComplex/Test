import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getShipmentProgress, getTrackingNumber, STATUS_LABELS } from "@/lib/shipping";

/** Escaped ein Feld für Semikolon-CSV (Excel-freundlich, deutsche Locale). */
function csvField(value: string | number): string {
  const s = String(value);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 });
  }

  const orders = await prisma.order.findMany({
    include: { user: true, items: true },
    orderBy: { placedAt: "desc" },
  });

  const header = [
    "Bestellnummer",
    "Datum",
    "Kunde",
    "Email",
    "Status",
    "Summe",
    "Rabatt",
    "Coins eingelöst",
    "Gutschein",
    "Tracking",
    "Artikelanzahl",
  ];

  const rows = orders.map((o) => {
    const progress = getShipmentProgress(o);
    return [
      `#${o.id.slice(-6).toUpperCase()}`,
      `${o.placedAt.toLocaleDateString("de-DE")} ${o.placedAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`,
      o.user.name || "",
      o.user.email,
      STATUS_LABELS[progress.currentStatus] ?? progress.currentStatus,
      o.total.toFixed(2).replace(".", ","),
      o.discountAmount.toFixed(2).replace(".", ","),
      o.coinsRedeemed,
      o.couponCode || "",
      getTrackingNumber(o.id),
      o.items.reduce((s, i) => s + i.quantity, 0),
    ]
      .map(csvField)
      .join(";");
  });

  // UTF-8 BOM, damit Excel Umlaute korrekt erkennt.
  const csv = "\uFEFF" + [header.join(";"), ...rows].join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="viralo-bestellungen-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
