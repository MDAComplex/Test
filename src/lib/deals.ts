// Blitzangebote (Flash Deals): Ein Deal ist "live", wenn er aktiv ist, im
// Zeitfenster liegt und das Kontingent (quantity - sold) noch nicht erschöpft ist.
import { prisma } from "@/lib/prisma";
import type { Deal } from "@prisma/client";
import { effectivePrice, type Priced } from "@/lib/pricing";

function liveWindow(now: Date) {
  return { active: true, startsAt: { lte: now }, endsAt: { gte: now } };
}

/** Liefert den (frühesten endenden) Live-Deal für ein Produkt oder null. */
export async function getActiveDeal(productId: string): Promise<Deal | null> {
  const now = new Date();
  const deals = await prisma.deal.findMany({
    where: { productId, ...liveWindow(now) },
    orderBy: { endsAt: "asc" },
  });
  return deals.find((d) => d.sold < d.quantity) ?? null;
}

/** Map productId -> Live-Deal für mehrere Produkte (je Produkt der früheste endende). */
export async function getActiveDealsMap(productIds: string[]): Promise<Map<string, Deal>> {
  const map = new Map<string, Deal>();
  if (productIds.length === 0) return map;
  const now = new Date();
  const deals = await prisma.deal.findMany({
    where: { productId: { in: productIds }, ...liveWindow(now) },
    orderBy: { endsAt: "asc" },
  });
  for (const d of deals) {
    if (d.sold < d.quantity && !map.has(d.productId)) map.set(d.productId, d);
  }
  return map;
}

/** Alle aktuell laufenden Deals (inkl. Produkt), max. ein Deal pro Produkt. */
export async function getCurrentDeals(limit = 8) {
  const now = new Date();
  const deals = await prisma.deal.findMany({
    where: liveWindow(now),
    orderBy: { endsAt: "asc" },
    include: { product: true },
  });
  const seen = new Set<string>();
  const out: typeof deals = [];
  for (const d of deals) {
    if (d.sold >= d.quantity || seen.has(d.productId)) continue;
    seen.add(d.productId);
    out.push(d);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Stückpreis unter Berücksichtigung des Deal-Kontingents: Der Deal-Preis gilt
 * nur, wenn das Restkontingent die gewünschte Menge abdeckt (bewusst simpel).
 */
export function dealUnitPrice(product: Priced, deal: Deal | null | undefined, quantity: number): number {
  if (deal && deal.quantity - deal.sold >= quantity) return effectivePrice(product, deal);
  return effectivePrice(product);
}
