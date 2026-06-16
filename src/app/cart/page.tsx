import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { updateCartQty, removeFromCart } from "@/lib/actions";
import ProductImage from "@/components/ProductImage";
import { Truck, Plus, Minus, Trash2 } from "lucide-react";

export default async function CartPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login?callbackUrl=/cart");

  const items = await prisma.cartItem.findMany({
    where: { userId },
    include: { product: true },
    orderBy: { id: "asc" },
  });

  const subtotal = items.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const total = subtotal;
  const coinsPreview = Math.round(total * 0.1);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Dein Warenkorb</h1>
      {items.length === 0 ? (
        <div>
          <p className="text-[#6b6b76] mb-4">Dein Warenkorb ist leer.</p>
          <Link href="/" className="text-[#ff5a1f] underline">
            Weiter shoppen
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-4 bg-white border border-[#e5e5e8] rounded-2xl p-4">
              <div className="w-16 h-16 rounded-xl bg-[#f4f4f5] flex items-center justify-center text-3xl overflow-hidden shrink-0">
                <ProductImage image={item.product.image} className="text-3xl w-full h-full object-cover flex items-center justify-center" />
              </div>
              <div className="flex-1">
                <Link href={`/product/${item.productId}`} className="font-semibold">
                  {item.product.name}
                </Link>
                <p className="text-[#ff5a1f] font-bold">{item.product.price.toFixed(2)} €</p>
                <p className="text-xs text-[#6b6b76] flex items-center gap-1">
                  <Truck size={14} /> {item.product.shippingMinDays}-{item.product.shippingMaxDays} Tage
                </p>
              </div>
              <div className="flex items-center gap-1">
                <form action={async () => { "use server"; await updateCartQty(item.id, item.quantity - 1); }}>
                  <button
                    type="submit"
                    aria-label="Menge verringern"
                    className="w-8 h-8 flex items-center justify-center bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg hover:border-[#ff5a1f]"
                  >
                    <Minus size={14} />
                  </button>
                </form>
                <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                <form action={async () => { "use server"; await updateCartQty(item.id, item.quantity + 1); }}>
                  <button
                    type="submit"
                    aria-label="Menge erhöhen"
                    className="w-8 h-8 flex items-center justify-center bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg hover:border-[#ff5a1f]"
                  >
                    <Plus size={14} />
                  </button>
                </form>
              </div>
              <form action={async () => { "use server"; await removeFromCart(item.id); }}>
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

          <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4 space-y-2">
            <div className="flex justify-between items-center text-sm text-[#6b6b76]">
              <span>Zwischensumme</span>
              <span>{subtotal.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between items-center font-bold text-lg border-t border-[#e5e5e8] pt-2">
              <span>Gesamtsumme</span>
              <span className="text-[#ff5a1f]">{total.toFixed(2)} €</span>
            </div>
          </div>
          <p className="text-center text-sm text-[#1faa59]">+{coinsPreview} Coins beim Bestellen</p>

          <Link
            href="/checkout"
            className="block text-center bg-[#ff5a1f] text-white py-3 rounded-lg font-semibold hover:opacity-90 glow-accent"
          >
            Zur Kasse
          </Link>
        </div>
      )}
    </div>
  );
}
