// Zentrale Preislogik: Rabatte werden überall konsistent über effectivePrice berechnet.

export type Priced = { price: number; discountPercent?: number | null };
export type DealLike = { percent: number } | null;

/**
 * Effektiver Preis: normaler Produktrabatt oder — falls ein Live-Deal übergeben
 * wird — der bessere der beiden Rabatte (der Kunde bekommt immer den besten Preis).
 */
export function effectivePrice(product: Priced, deal?: DealLike): number {
  const discount = Math.max(product.discountPercent ?? 0, deal?.percent ?? 0);
  if (discount <= 0) return product.price;
  return Math.round(product.price * (1 - discount / 100) * 100) / 100;
}

export function hasDiscount(product: Priced): boolean {
  return (product.discountPercent ?? 0) > 0;
}

export function formatPrice(value: number): string {
  return `${value.toFixed(2)} €`;
}
