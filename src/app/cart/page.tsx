import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { updateCartQty, removeFromCart } from "@/lib/actions";
import { readGuestCart } from "@/lib/guestCart";
import ProductImage from "@/components/ProductImage";
import { effectivePrice, hasDiscount } from "@/lib/pricing";
import { Truck, Plus, Minus, Trash2, Info } from "lucide-react";

type CartRow = {
  key: string;
  /** id, das an updateCartQty/removeFromCart übergeben wird (DB-id oder productId für Gäste). */
  mutationId: string;
  productId: string;
  quantity: number;
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

  if (userId) {
    const items = await prisma.cartItem.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { id: "asc" },
    });
    rows = items.map((i) => ({
      key: i.id,
      mutationId: i.id,
      productId: i.productId,
      quantity: i.quantity,
      product: i.product,
    }));
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
        return [{ key: i.productId, mutationId: i.productId, productId: i.productId, quantity: i.quantity, product }];
      });
    }
  }

  const subtotal = rows.reduce((s, i) => s + effectivePrice(i.product) * i.quantity, 0);
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
                <p className="flex items-baseline gap-2">
                  <span className="text-[#ff5a1f] font-bold">{effectivePrice(item.product).toFixed(2)} €</span>
                  {hasDiscount(item.product) && (
                    <>
                      <span className="text-xs text-[#6b6b76] line-through">{item.product.price.toFixed(2)} €</span>
                      <span className="text-[10px] font-bold text-white bg-[#ff5a1f] rounded px-1 py-0.5">
                        -{item.product.discountPercent}%
                      </span>
                    </>
                  )}
                </p>
                <p className="text-xs text-[#6b6b76] flex items-center gap-1">
                  <Truck size={14} /> {item.product.shippingMinDays}-{item.product.shippingMaxDays} Tage
                </p>
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
    </div>
  );
}
