// "Wird oft zusammen gekauft": Co-Occurrence-Analyse über Bestellpositionen.
import { prisma } from "@/lib/prisma";

/**
 * Findet Produkte, die in denselben Bestellungen wie `productId` auftauchen,
 * sortiert nach Häufigkeit. Nur existierende Produkte mit Lagerbestand.
 */
export async function getBoughtTogether(productId: string, limit = 4) {
  const containing = await prisma.orderItem.findMany({
    where: { productId },
    select: { orderId: true },
    take: 500,
  });
  const orderIds = [...new Set(containing.map((i) => i.orderId))];
  if (orderIds.length === 0) return [];

  const coItems = await prisma.orderItem.findMany({
    where: { orderId: { in: orderIds }, productId: { not: productId } },
    select: { productId: true },
  });

  const counts = new Map<string, number>();
  for (const item of coItems) {
    if (!item.productId) continue;
    counts.set(item.productId, (counts.get(item.productId) ?? 0) + 1);
  }
  const rankedIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  if (rankedIds.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: rankedIds.slice(0, limit * 3) }, stock: { gt: 0 } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  return rankedIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])).slice(0, limit);
}
