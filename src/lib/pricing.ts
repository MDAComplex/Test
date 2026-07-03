// Zentrale Preislogik: Rabatte werden überall konsistent über effectivePrice berechnet.

export type Priced = { price: number; discountPercent?: number | null };

export function effectivePrice(product: Priced): number {
  const discount = product.discountPercent ?? 0;
  if (discount <= 0) return product.price;
  return Math.round(product.price * (1 - discount / 100) * 100) / 100;
}

export function hasDiscount(product: Priced): boolean {
  return (product.discountPercent ?? 0) > 0;
}

export function formatPrice(value: number): string {
  return `${value.toFixed(2)} €`;
}
