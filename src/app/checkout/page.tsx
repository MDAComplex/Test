import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { checkout, validateCoupon } from "@/lib/actions";
import { effectivePrice, hasDiscount } from "@/lib/pricing";
import { COUNTRIES, countryName } from "@/lib/countries";
import AdBanner from "@/components/AdBanner";
import { Package, CreditCard, Truck, RotateCcw, ShieldCheck, Lock, TicketPercent, Info, Coins } from "lucide-react";

export default async function CheckoutPage(props: {
  searchParams: Promise<{ coupon?: string; coins?: string }>;
}) {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect("/login?callbackUrl=/checkout");

  const { coupon: couponParam, coins: coinsParam } = await props.searchParams;

  const [items, dbUser, addresses] = await Promise.all([
    prisma.cartItem.findMany({ where: { userId }, include: { product: true } }),
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.address.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }),
  ]);

  if (items.length === 0) redirect("/cart");

  const subtotal = items.reduce((s, i) => s + effectivePrice(i.product) * i.quantity, 0);

  // Gutschein aus dem GET-Parameter serverseitig prüfen (existiert, aktiv, nicht abgelaufen).
  const couponInvalid = couponParam === "invalid";
  const coupon = couponParam && !couponInvalid ? await validateCoupon(couponParam) : null;
  const couponNotFound = !!couponParam && !couponInvalid && !coupon;
  const discountAmount = coupon ? Math.round(subtotal * (coupon.percent / 100) * 100) / 100 : 0;
  const afterCoupon = Math.max(0, subtotal - discountAmount);

  // Coins einlösen (100 Coins = 1 €): Vorschau über ?coins=, final geprüft in der Action.
  const coinBalance = dbUser?.coins ?? 0;
  const maxRedeemable = Math.min(coinBalance, Math.floor(afterCoupon * 100));
  const canRedeem = coinBalance >= 100 && maxRedeemable >= 100;
  const requestedCoins = Math.max(0, parseInt(coinsParam || "0", 10) || 0);
  const redeemCoins = canRedeem ? Math.min(requestedCoins, maxRedeemable) : 0;
  const effectiveRedeem = redeemCoins >= 100 ? redeemCoins : 0;
  const coinsDiscount = effectiveRedeem / 100;

  const total = Math.max(0, afterCoupon - coinsDiscount);

  const inputClass =
    "w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#ff5a1f] focus:border-[#ff5a1f]";

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid md:grid-cols-3 gap-8">
      <div className="md:col-span-2 space-y-6">
        <h1 className="text-2xl font-bold">Kasse</h1>
        <form action={checkout} className="space-y-6 bg-white border border-[#e5e5e8] rounded-2xl p-6 shadow-sm">
          <div className="bg-[#fff7ed] border border-[#ffd6c2] text-[#9a3412] text-sm rounded-xl p-3 flex gap-2">
            <Info size={16} className="shrink-0 mt-0.5" />
            <span>
              Dies ist eine Demo — es werden keine echten Bestellungen ausgelöst und kein Geld
              eingezogen. Die Belastung beträgt <strong>CHF 0.00</strong>. Trage beliebige Test-Daten ein.
            </span>
          </div>

          <div>
            <h2 className="font-bold mb-3 flex items-center gap-2"><Package size={18} /> Lieferadresse</h2>

            {addresses.length > 0 && (
              <div className="space-y-2 mb-4">
                {addresses.map((a, idx) => (
                  <label
                    key={a.id}
                    className="flex items-start gap-3 border border-[#e5e5e8] rounded-xl p-3 cursor-pointer hover:border-[#ff5a1f]/60"
                  >
                    <input
                      type="radio"
                      name="addressId"
                      value={a.id}
                      defaultChecked={idx === 0}
                      className="mt-1 accent-[#ff5a1f]"
                    />
                    <span className="text-sm">
                      <span className="font-semibold">{a.name}</span>
                      {a.isDefault && (
                        <span className="ml-2 text-[10px] font-bold text-[#1faa59] bg-[#eafbf1] px-1.5 py-0.5 rounded">
                          Standard
                        </span>
                      )}
                      <br />
                      <span className="text-[#6b6b76]">
                        {a.street}, {a.zip} {a.city}, {countryName(a.country)}
                      </span>
                    </span>
                  </label>
                ))}
                <label className="flex items-center gap-3 border border-[#e5e5e8] rounded-xl p-3 cursor-pointer hover:border-[#ff5a1f]/60">
                  <input type="radio" name="addressId" value="new" className="accent-[#ff5a1f]" />
                  <span className="text-sm font-semibold">Neue Adresse eingeben</span>
                </label>
              </div>
            )}

            <div className="space-y-3">
              <input name="shippingName" required={addresses.length === 0} placeholder="Vollständiger Name" className={inputClass} />
              <input name="shippingStreet" required={addresses.length === 0} placeholder="Straße und Hausnummer" className={inputClass} />
              <div className="flex gap-3">
                <input name="shippingZip" required={addresses.length === 0} placeholder="PLZ" className={`${inputClass} w-1/3`} />
                <input name="shippingCity" required={addresses.length === 0} placeholder="Ort" className={`${inputClass} w-2/3`} />
              </div>
              <select name="shippingCountry" defaultValue="CH" className={inputClass}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm text-[#6b6b76]">
                <input type="checkbox" name="saveAddress" className="accent-[#ff5a1f]" />
                Adresse speichern
              </label>
            </div>
          </div>

          <div>
            <h2 className="font-bold mb-3 flex items-center gap-2"><CreditCard size={18} /> Zahlungsmethode</h2>
            {/* Fiktive Zahlungsdaten: bewusst NICHT streng validiert, NICHT gespeichert und
                NICHT verarbeitet — mit diesen Feldern passiert nichts (Demo, Belastung CHF 0.00). */}
            <div className="space-y-3">
              <input placeholder="Kartennummer (z.B. 4242 4242 4242 4242)" autoComplete="off" className={inputClass} />
              <div className="flex gap-3">
                <input placeholder="Ablaufdatum MM/JJ" autoComplete="off" className={`${inputClass} w-1/2`} />
                <input placeholder="CVC" autoComplete="off" className={`${inputClass} w-1/2`} />
              </div>
              <input placeholder="Name auf Karte" autoComplete="off" className={inputClass} />
              <p className="text-xs text-[#6b6b76] flex items-center gap-1">
                <Lock size={12} /> Demo-Zahlung: Es wird CHF 0.00 belastet. Diese Felder werden nicht
                überprüft, nicht gespeichert und nicht verarbeitet.
              </p>
            </div>
          </div>

          {coupon && <input type="hidden" name="couponCode" value={coupon.code} />}
          {effectiveRedeem > 0 && <input type="hidden" name="redeemCoins" value={effectiveRedeem} />}

          <button className="w-full bg-[#ff5a1f] text-white py-3 rounded-lg font-semibold hover:opacity-90 glow-accent">
            Jetzt kaufen — CHF 0.00 zahlen
          </button>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-[#6b6b76] pt-2 border-t border-[#e5e5e8]">
            <span className="flex items-center gap-1"><Truck size={14} className="text-[#1faa59]" /> Kostenloser Versand</span>
            <span className="flex items-center gap-1"><RotateCcw size={14} className="text-[#1faa59]" /> 30 Tage Rückgaberecht</span>
            <span className="flex items-center gap-1"><Lock size={14} className="text-[#1faa59]" /> Sichere Bezahlung</span>
            <span className="flex items-center gap-1"><ShieldCheck size={14} className="text-[#1faa59]" /> Käuferschutz</span>
          </div>
        </form>
      </div>

      <div className="space-y-4 md:pt-11">
        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold mb-3">Bestellübersicht</h2>
          {items.map((i) => (
            <div key={i.id} className="flex justify-between gap-2 text-sm py-1">
              <span className="text-[#1c1c1f]">{i.product.name} × {i.quantity}</span>
              <span className="font-semibold whitespace-nowrap">
                {hasDiscount(i.product) && (
                  <span className="text-[#6b6b76] line-through mr-1 font-normal">
                    {(i.product.price * i.quantity).toFixed(2)} €
                  </span>
                )}
                {(effectivePrice(i.product) * i.quantity).toFixed(2)} €
              </span>
            </div>
          ))}
          <div className="border-t border-[#e5e5e8] mt-2 pt-2 space-y-1 text-sm">
            <div className="flex justify-between text-[#6b6b76]">
              <span>Zwischensumme</span>
              <span>{subtotal.toFixed(2)} €</span>
            </div>
            {coupon && (
              <div className="flex justify-between text-[#1faa59]">
                <span>Gutschein {coupon.code} (−{coupon.percent}%)</span>
                <span>−{discountAmount.toFixed(2)} €</span>
              </div>
            )}
            {effectiveRedeem > 0 && (
              <div className="flex justify-between text-[#1faa59]">
                <span>Coins-Rabatt ({effectiveRedeem} Coins)</span>
                <span>−{coinsDiscount.toFixed(2)} €</span>
              </div>
            )}
            <div className="flex justify-between text-[#6b6b76]">
              <span>Versand</span>
              <span className="text-[#1faa59] font-medium">Kostenlos</span>
            </div>
            <div className="flex justify-between font-semibold border-t border-[#e5e5e8] pt-2">
              <span>Warenwert</span>
              <span className="line-through text-[#6b6b76]">{total.toFixed(2)} €</span>
            </div>
            <div className="flex justify-between font-extrabold text-lg">
              <span>Heute zu zahlen</span>
              <span className="text-[#1faa59]">CHF 0.00</span>
            </div>
          </div>
        </div>

        {coinBalance >= 100 && (
          <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4 shadow-sm">
            <h2 className="font-bold mb-2 flex items-center gap-2 text-sm">
              <Coins size={16} className="text-[#1faa59]" /> Coins einlösen
            </h2>
            <p className="text-xs text-[#6b6b76] mb-2">
              Du hast <span className="font-bold text-[#1faa59]">{coinBalance} Coins</span>.
              100 Coins = 1 € Rabatt. Maximal einlösbar: {maxRedeemable} Coins.
            </p>
            {/* GET-Formular: die Coin-Anzahl landet als ?coins= im Checkout (Vorschau);
                final validiert die checkout-Action serverseitig. */}
            <form action="/checkout" method="GET" className="flex gap-2">
              {coupon && <input type="hidden" name="coupon" value={coupon.code} />}
              <input
                type="number"
                name="coins"
                min={100}
                max={maxRedeemable}
                step={100}
                defaultValue={effectiveRedeem || Math.min(100, maxRedeemable)}
                className="flex-1 min-w-0 bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-3 py-2 text-sm"
              />
              <button className="bg-[#1c1c1f] text-white px-3 py-2 rounded-lg text-sm font-semibold">
                Einlösen
              </button>
            </form>
            {effectiveRedeem > 0 && (
              <p className="text-xs text-[#1faa59] mt-2">
                {effectiveRedeem} Coins werden eingelöst: −{coinsDiscount.toFixed(2)} €.
              </p>
            )}
          </div>
        )}

        <div className="bg-white border border-[#e5e5e8] rounded-2xl p-4 shadow-sm">
          <h2 className="font-bold mb-2 flex items-center gap-2 text-sm">
            <TicketPercent size={16} className="text-[#ff5a1f]" /> Gutscheincode
          </h2>
          {/* GET-Formular: der Code landet als ?coupon= im Checkout und wird serverseitig geprüft. */}
          <form action="/checkout" method="GET" className="flex gap-2">
            {effectiveRedeem > 0 && <input type="hidden" name="coins" value={effectiveRedeem} />}
            <input
              type="text"
              name="coupon"
              defaultValue={coupon?.code ?? ""}
              placeholder="Code eingeben"
              className="flex-1 min-w-0 bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-3 py-2 text-sm uppercase"
            />
            <button className="bg-[#1c1c1f] text-white px-3 py-2 rounded-lg text-sm font-semibold">
              Einlösen
            </button>
          </form>
          {(couponInvalid || couponNotFound) && (
            <p className="text-xs text-red-500 mt-2">
              Dieser Gutscheincode ist ungültig oder abgelaufen.
            </p>
          )}
          {coupon && (
            <p className="text-xs text-[#1faa59] mt-2">
              Gutschein {coupon.code} angewendet: −{coupon.percent}% auf die Zwischensumme.
            </p>
          )}
        </div>

        <AdBanner slot="checkout-sidebar" />
      </div>
    </div>
  );
}
