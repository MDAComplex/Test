import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { checkout } from "@/lib/actions";
import AdBanner from "@/components/AdBanner";
import { Package, CreditCard } from "lucide-react";

export default async function CheckoutPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login?callbackUrl=/checkout");

  const items = await prisma.cartItem.findMany({
    where: { userId },
    include: { product: true },
  });

  if (items.length === 0) redirect("/cart");

  const total = items.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const coinsPreview = Math.round(total * 0.1);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 grid md:grid-cols-3 gap-8">
      <form action={checkout} className="md:col-span-2 space-y-6 bg-white border border-[#e5e5e8] rounded-2xl p-6">
        <div className="bg-[#2c2410] border border-[#5a4a1a] text-[#f0c84a] text-sm rounded-xl p-3">
          🎮 Dies ist ein Spiel/Demo — es werden keine echten Bestellungen ausgelöst und kein Geld
          eingezogen. Trage beliebige Test-Daten ein.
        </div>

        <div>
          <h2 className="font-bold mb-3 flex items-center gap-2"><Package size={18} /> Lieferadresse</h2>
          <div className="space-y-3">
            <input
              name="shippingName"
              required
              placeholder="Vollständiger Name"
              className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f] focus:border-[#ff5a1f]"
            />
            <textarea
              name="shippingAddress"
              required
              placeholder="Straße, PLZ, Ort, Land"
              className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f] focus:border-[#ff5a1f]"
              rows={3}
            />
          </div>
        </div>

        <div>
          <h2 className="font-bold mb-3 flex items-center gap-2"><CreditCard size={18} /> Zahlung (fiktiv)</h2>
          <div className="space-y-3">
            <input placeholder="Kartennummer (z.B. 4242 4242 4242 4242)" className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f] focus:border-[#ff5a1f]" />
            <div className="flex gap-3">
              <input placeholder="MM/JJ" className="w-1/2 bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f] focus:border-[#ff5a1f]" />
              <input placeholder="CVC" className="w-1/2 bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f] focus:border-[#ff5a1f]" />
            </div>
            <p className="text-xs text-[#6b6b76]">
              Diese Felder werden nicht überprüft, nicht gespeichert und nicht verarbeitet.
            </p>
          </div>
        </div>

        <button className="w-full bg-[#ff5a1f] text-white py-3 rounded-lg font-semibold hover:opacity-90 glow-accent">
          Jetzt kostenlos bestellen (+{coinsPreview} Coins)
        </button>
      </form>

      <div className="space-y-4">
        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4">
          <h2 className="font-bold mb-3">Bestellübersicht</h2>
          {items.map((i) => (
            <div key={i.id} className="flex justify-between text-sm py-1">
              <span>{i.product.name} × {i.quantity}</span>
              <span className="text-[#ff5a1f] font-semibold">{(i.product.price * i.quantity).toFixed(2)} €</span>
            </div>
          ))}
          <div className="flex justify-between font-bold border-t border-[#e5e5e8] mt-2 pt-2">
            <span>Gesamt</span>
            <span className="text-[#ff5a1f]">{total.toFixed(2)} €</span>
          </div>
        </div>
        <AdBanner slot="checkout-sidebar" />
      </div>
    </div>
  );
}
