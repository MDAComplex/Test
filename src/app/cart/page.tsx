import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { updateCartQty, removeFromCart, saveForLater, moveToCart } from "@/lib/actions";
import { readGuestCart } from "@/lib/guestCart";
import ProductImage from "@/components/ProductImage";
import { effectivePrice, hasDiscount } from "@/lib/pricing";
import { getActiveDealsMap, dealUnitPrice } from "@/lib/deals";
import { Truck, Plus, Minus, Trash2, Info, Bookmark, ShoppingCart } from "lucide-react";

type CartRow = {
  key: string;
  /** id, das an updateCartQty/removeFromCart übergeben wird (DB-id oder "productId::variant" für Gäste). */
  mutationId: string;
  productId: string;
  quantity: number;
  variant: string;
  product: {
    id: string;
    name: string;
    image: string;
    price: number;
    discountPercent: number;
    shippingMinDays: number;
    shippingMaxDays: number;
  };
};

export default async function CartPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  let rows: CartRow[] = [];
  let savedRows: CartRow[] = [];

  if (userId) {
    const items = await prisma.cartItem.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { id: "asc" },
    });
    const toRow = (i: (typeof items)[number]): CartRow => ({
      key: i.id,
      mutationId: i.id,
      productId: i.productId,
      quantity: i.quantity,
      variant: i.variant,
      product: i.product,
    });
    rows = items.filter((i) => !i.savedForLater).map(toRow);
    savedRows = items.filter((i) => i.savedForLater).map(toRow);
  } else {
    // Gast-Warenkorb aus dem Cookie: Produkte per id nachladen.
    const guestItems = await readGuestCart();
    if (guestItems.length > 0) {
      const products = await prisma.product.findMany({
        where: { id: { in: guestItems.map((i) => i.productId) } },
      });
      const byId = new Map(products.map((p) => [p.id, p]));
      rows = guestItems.flatMap((i) => {
        const product = byId.get(i.productId);
        if (!product) return [];
        const variant = i.variant ?? "";
        return [
          {
            key: `${i.productId}::${variant}`,
            mutationId: `${i.productId}::${variant}`,
            productId: i.productId,
            quantity: i.quantity,
            variant,
            product,
          },
        ];
      });
    }
  }

  // Blitzangebote: Deal-Preis, wenn das Restkontingent die Menge abdeckt (wie im Checkout).
  const dealsMap = await getActiveDealsMap(rows.map((r) => r.productId));
  const rowUnitPrice = (r: CartRow) => dealUnitPrice(r.product, dealsMap.get(r.productId), r.quantity);
  const rowBadgePercent = (r: CartRow) => {
    const deal = dealsMap.get(r.productId);
    return deal && deal.quantity - deal.sold >= r.quantity
      ? Math.max(deal.percent, r.product.discountPercent)
      : r.product.discountPercent;
  };

  const subtotal = rows.reduce((s, i) => s + rowUnitPrice(i) * i.quantity, 0);
  const total = subtotal;
  // 10 Coins Bestellbonus sofort + Lieferbonus (~10% des Warenwerts) bei Zustellung.
  const deliveryBonus = Math.max(5, Math.round(total * 0.1));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Dein Warenkorb</h1>
      {rows.length === 0 ? (
        <div>
          <p className="text-[#6b6b76] mb-4">Dein Warenkorb ist leer.</p>
          <Link href="/" className="text-[#ff5a1f] underline">
            Weiter shoppen
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((item) => (
            <div key={item.key} className="flex items-center gap-4 bg-white border border-[#e5e5e8] rounded-2xl p-4 shadow-sm">
              <div className="w-16 h-16 rounded-xl bg-[#f4f4f5] flex items-center justify-center text-3xl overflow-hidden shrink-0">
                <ProductImage image={item.product.image} className="text-3xl w-full h-full object-cover flex items-center justify-center" />
              </div>
              <div className="flex-1">
                <Link href={`/product/${item.productId}`} className="font-semibold">
                  {item.product.name}
                </Link>
                {item.variant && (
                  <span className="ml-2 text-xs text-[#6b6b76] bg-[#f4f4f5] border border-[#e5e5e8] px-1.5 py-0.5 rounded">
                    Größe: {item.variant}
                  </span>
                )}
                <p className="flex items-baseline gap-2">
                  <span className="text-[#ff5a1f] font-bold">{rowUnitPrice(item).toFixed(2)} €</span>
                  {rowBadgePercent(item) > 0 && (
                    <>
                      <span className="text-xs text-[#6b6b76] line-through">{item.product.price.toFixed(2)} €</span>
                      <span className="text-[10px] font-bold text-white bg-[#ff5a1f] rounded px-1 py-0.5">
                        -{rowBadgePercent(item)}%
                      </span>
                    </>
                  )}
                </p>
                <p className="text-xs text-[#6b6b76] flex items-center gap-1">
                  <Truck size={14} /> {item.product.shippingMinDays}-{item.product.shippingMaxDays} Tage
                </p>
                {userId && (
                  <form action={async () => { "use server"; await saveForLater(item.mutationId); }}>
                    <button
                      type="submit"
                      className="mt-1 text-xs text-[#6b6b76] hover:text-[#ff5a1f] underline flex items-center gap-1"
                    >
                      <Bookmark size={12} /> Für später speichern
                    </button>
                  </form>
                )}
              </div>
              <div className="flex items-center gap-1">
                <form action={async () => { "use server"; await updateCartQty(item.mutationId, item.quantity - 1); }}>
                  <button
                    type="submit"
                    aria-label="Menge verringern"
                    className="w-8 h-8 flex items-center justify-center bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg hover:border-[#ff5a1f]"
                  >
                    <Minus size={14} />
                  </button>
                </form>
                <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                <form action={async () => { "use server"; await updateCartQty(item.mutationId, item.quantity + 1); }}>
                  <button
                    type="submit"
                    aria-label="Menge erhöhen"
                    className="w-8 h-8 flex items-center justify-center bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg hover:border-[#ff5a1f]"
                  >
                    <Plus size={14} />
                  </button>
                </form>
              </div>
              <form action={async () => { "use server"; await removeFromCart(item.mutationId); }}>
                <button
                  type="submit"
                  aria-label="Entfernen"
                  className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-500"
                >
                  <Trash2 size={16} />
                </button>
              </form>
            </div>
          ))}

          <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4 space-y-2 shadow-sm">
            <div className="flex justify-between items-center text-sm text-[#6b6b76]">
              <span>Zwischensumme</span>
              <span>{subtotal.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between items-center font-bold text-lg border-t border-[#e5e5e8] pt-2">
              <span>Gesamtsumme</span>
              <span className="text-[#ff5a1f]">{total.toFixed(2)} €</span>
            </div>
          </div>
          <p className="text-center text-sm text-[#1faa59]">
            +10 Coins beim Bestellen · +{deliveryBonus} Coins bei Zustellung
          </p>

          {userId ? (
            <Link
              href="/checkout"
              className="block text-center bg-[#ff5a1f] text-white py-3 rounded-lg font-semibold hover:opacity-90 glow-accent"
            >
              Zur Kasse
            </Link>
          ) : (
            <div className="space-y-2">
              <Link
                href="/login?callbackUrl=/checkout"
                className="block text-center bg-[#ff5a1f] text-white py-3 rounded-lg font-semibold hover:opacity-90 glow-accent"
              >
                Zur Kasse
              </Link>
              <p className="text-center text-sm text-[#6b6b76] flex items-center justify-center gap-1.5">
                <Info size={14} className="shrink-0" />
                Zum Bestellen bitte anmelden – dein Warenkorb bleibt erhalten.
              </p>
            </div>
          )}
        </div>
      )}

      {savedRows.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Bookmark size={18} className="text-[#6b6b76]" /> Für später gespeichert
          </h2>
          <div className="space-y-3">
            {savedRows.map((item) => (
              <div key={item.key} className="flex items-center gap-4 bg-[#f7f7f8] border border-[#e5e5e8] rounded-2xl p-4">
                <div className="w-14 h-14 rounded-xl bg-[#f4f4f5] flex items-center justify-center text-2xl overflow-hidden shrink-0">
                  <ProductImage image={item.product.image} className="text-2xl w-full h-full object-cover flex items-center justify-center" />
                </div>
                <div className="flex-1">
                  <Link href={`/product/${item.productId}`} className="font-semibold text-sm">
                    {item.product.name}
                  </Link>
                  {item.variant && (
                    <span className="ml-2 text-xs text-[#6b6b76] bg-white border border-[#e5e5e8] px-1.5 py-0.5 rounded">
                      Größe: {item.variant}
                    </span>
                  )}
                  <p className="text-sm text-[#ff5a1f] font-bold">
                    {effectivePrice(item.product).toFixed(2)} € <span className="text-xs text-[#6b6b76] font-normal">× {item.quantity}</span>
                  </p>
                </div>
                <form action={async () => { "use server"; await moveToCart(item.mutationId); }}>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 bg-white border border-[#e5e5e8] text-[#1c1c1f] px-3 py-2 rounded-lg text-xs font-semibold hover:border-[#ff5a1f]"
                  >
                    <ShoppingCart size={13} /> In den Warenkorb
                  </button>
                </form>
                <form action={async () => { "use server"; await removeFromCart(item.mutationId); }}>
                  <button
                    type="submit"
                    aria-label="Entfernen"
                    className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-500"
                  >
                    <Trash2 size={15} />
                  </button>
                </form>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
