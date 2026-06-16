import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { checkout } from "@/lib/actions";
import AdBanner from "@/components/AdBanner";

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
      <form action={checkout} className="md:col-span-2 space-y-6 bg-[#1a1a22] border border-[#2c2c38] rounded-2xl p-6">
        <div className="bg-[#2c2410] border border-[#5a4a1a] text-[#f0c84a] text-sm rounded-xl p-3">
          🎮 Dies ist ein Spiel/Demo — es werden keine echten Bestellungen ausgelöst und kein Geld
          eingezogen. Trage beliebige Test-Daten ein.
        </div>

        <div>
          <h2 className="font-bold mb-3">📦 Lieferadresse</h2>
          <div className="space-y-3">
            <input
              name="shippingName"
              required
              placeholder="Vollständiger Name"
              className="w-full bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2"
            />
            <textarea
              name="shippingAddress"
              required
              placeholder="Straße, PLZ, Ort, Land"
              className="w-full bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2"
              rows={3}
            />
          </div>
        </div>

        <div>
          <h2 className="font-bold mb-3">💳 Zahlung (fiktiv)</h2>
          <div className="space-y-3">
            <input placeholder="Kartennummer (z.B. 4242 4242 4242 4242)" className="w-full bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
            <div className="flex gap-3">
              <input placeholder="MM/JJ" className="w-1/2 bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
              <input placeholder="CVC" className="w-1/2 bg-[#22222c] border border-[#2c2c38] rounded-xl px-3 py-2" />
            </div>
            <p className="text-xs text-[#6b6b7a]">
              Diese Felder werden nicht überprüft, nicht gespeichert und nicht verarbeitet.
            </p>
          </div>
        </div>

        <button className="w-full bg-[#ff2d92] text-white py-3 rounded-xl font-semibold hover:opacity-90 glow-accent">
          Jetzt kostenlos bestellen (+{coinsPreview} Coins)
        </button>
      </form>

      <div className="space-y-4">
        <div className="bg-[#1a1a22] border border-[#2c2c38] rounded-2xl p-4">
          <h2 className="font-bold mb-3">Bestellübersicht</h2>
          {items.map((i) => (
            <div key={i.id} className="flex justify-between text-sm py-1">
              <span>{i.product.name} × {i.quantity}</span>
              <span>{(i.product.price * i.quantity).toFixed(2)} €</span>
            </div>
          ))}
          <div className="flex justify-between font-bold border-t border-[#2c2c38] mt-2 pt-2">
            <span>Gesamt</span>
            <span>{total.toFixed(2)} €</span>
          </div>
        </div>
        <AdBanner slot="checkout-sidebar" />
      </div>
    </div>
  );
}
