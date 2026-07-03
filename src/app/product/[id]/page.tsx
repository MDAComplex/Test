import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { addToCart, toggleWishlist, trackRecentlyViewed, hasDeliveredProduct, submitReview } from "@/lib/actions";
import { auth } from "@/lib/auth";
import { getProductRating } from "@/lib/reviews";
import { getRatingsMap } from "@/lib/reviews";
import ProductImage from "@/components/ProductImage";
import ProductCard from "@/components/ProductCard";
import Link from "next/link";
import { effectivePrice, hasDiscount } from "@/lib/pricing";
import { Truck, Star, Heart, RotateCcw, Lock, ShieldCheck, BadgeCheck } from "lucide-react";

export default async function ProductPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ qty?: string; img?: string }> }) {
  const { id } = await props.params;
  const { qty, img } = await props.searchParams;
  const quantity = Math.max(1, parseInt(qty || "1", 10) || 1);

  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true },
  });

  if (!product) notFound();

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  // "Zuletzt angesehen" für eingeloggte Nutzer aktualisieren (billig: 1 Upsert).
  if (userId) await trackRecentlyViewed(userId, product.id);

  const [rating, reviews, isWishlisted, similarProducts] = await Promise.all([
    getProductRating(product.id),
    prisma.review.findMany({ where: { productId: product.id }, orderBy: { createdAt: "desc" } }),
    userId
      ? prisma.wishlist.findUnique({ where: { userId_productId: { userId, productId: product.id } } }).then((w) => !!w)
      : Promise.resolve(false),
    prisma.product.findMany({
      where: { categoryId: product.categoryId, id: { not: product.id } },
      take: 6,
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const similarRatings = await getRatingsMap(similarProducts.map((p) => p.id));

  // Bewertungsformular nur für Nutzer mit zugestellter Bestellung ohne bisherige Bewertung.
  const alreadyReviewed = userId ? reviews.some((r) => r.userId === userId) : false;
  const canReview = userId && !alreadyReviewed ? await hasDeliveredProduct(userId, product.id) : false;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href={`/category/${product.category.slug}`} className="text-sm text-[#6b6b76] hover:text-[#1c1c1f]">
        ← {product.category.name}
      </Link>
      <div className="grid md:grid-cols-2 gap-8 mt-4">
        <div className="space-y-3">
        <div className="aspect-square text-[8rem] flex items-center justify-center bg-white border border-[#e5e5e8] rounded-2xl overflow-hidden relative">
          {product.discountPercent > 0 && (
            <span className="absolute top-3 left-3 z-10 bg-[#ff5a1f] text-white text-sm font-bold px-2.5 py-1 rounded-lg">
              -{product.discountPercent}%
            </span>
          )}
          <ProductImage
            image={
              // Galerie: ?img=N wählt ein Bild aus product.images, 0 = Hauptbild.
              (() => {
                const gallery = [product.image, ...product.images];
                const idx = Math.min(Math.max(parseInt(img || "0", 10) || 0, 0), gallery.length - 1);
                return gallery[idx];
              })()
            }
            className="text-[8rem] w-full h-full object-cover flex items-center justify-center"
          />
          <form
            action={async () => {
              "use server";
              await toggleWishlist(product.id);
            }}
            className="absolute top-3 right-3"
          >
            <button
              type="submit"
              aria-label="Zur Wunschliste"
              className="w-10 h-10 rounded-full bg-white/90 border border-[#e5e5e8] flex items-center justify-center hover:border-[#ff5a1f]"
            >
              <Heart size={20} className={isWishlisted ? "text-[#ff5a1f]" : "text-[#6b6b76]"} fill={isWishlisted ? "currentColor" : "none"} />
            </button>
          </form>
        </div>

        {product.images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {[product.image, ...product.images].map((image, i) => {
              const activeIdx = Math.min(Math.max(parseInt(img || "0", 10) || 0, 0), product.images.length);
              return (
                <Link
                  key={i}
                  href={`/product/${product.id}?img=${i}`}
                  scroll={false}
                  className={`w-16 h-16 shrink-0 rounded-xl overflow-hidden border-2 bg-[#f4f4f5] flex items-center justify-center ${
                    i === activeIdx ? "border-[#ff5a1f]" : "border-[#e5e5e8] hover:border-[#ff5a1f]/50"
                  }`}
                >
                  <ProductImage image={image} className="w-full h-full object-cover flex items-center justify-center text-2xl" />
                </Link>
              );
            })}
          </div>
        )}

        {product.videoUrl && (
          <video controls src={product.videoUrl} className="w-full rounded-2xl border border-[#e5e5e8]" />
        )}
        </div>
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <div className="flex items-baseline gap-3">
            <p className="text-3xl font-extrabold text-[#ff5a1f]">{effectivePrice(product).toFixed(2)} €</p>
            {hasDiscount(product) && (
              <>
                <p className="text-lg text-[#6b6b76] line-through">{product.price.toFixed(2)} €</p>
                <span className="bg-[#ff5a1f] text-white text-xs font-bold px-2 py-0.5 rounded-lg">
                  -{product.discountPercent}%
                </span>
              </>
            )}
          </div>

          {rating.count > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    className={i < Math.round(rating.avg) ? "text-[#ff5a1f]" : "text-[#e5e5e8]"}
                    fill={i < Math.round(rating.avg) ? "currentColor" : "none"}
                  />
                ))}
              </div>
              <span className="text-sm text-[#6b6b76]">
                {rating.avg.toFixed(1)} von 5 ({rating.count} Bewertungen)
              </span>
            </div>
          )}

          <p className="text-[#6b6b76]">{product.description}</p>
          <p className="text-sm text-[#6b6b76]">Kategorie: {product.category.name}</p>
          <p className="text-sm bg-[#eafbf1] text-[#1faa59] inline-flex items-center gap-1 px-3 py-1 rounded-full">
            <Truck size={14} /> Lieferung in {product.shippingMinDays}-{product.shippingMaxDays} Werktagen
          </p>
          {product.stock <= 0 ? (
            <p className="text-sm font-medium text-[#6b6b76] bg-[#f4f4f5] border border-[#e5e5e8] inline-block px-3 py-1 rounded-full">
              Ausverkauft
            </p>
          ) : product.stock < 10 ? (
            <p className="text-sm font-semibold text-[#ff5a1f]">Nur noch {product.stock} verfügbar</p>
          ) : (
            <p className="text-sm font-medium text-[#1faa59]">Auf Lager</p>
          )}

          <form
            action={async (fd) => {
              "use server";
              const q = Math.max(1, parseInt(String(fd.get("quantity")), 10) || 1);
              const variant = String(fd.get("variant") || "");
              await addToCart(product.id, q, variant);
            }}
            className="flex flex-wrap items-center gap-3"
          >
            {product.sizes.length > 0 && (
              <fieldset className="w-full">
                <legend className="text-sm font-semibold mb-2">Größe wählen</legend>
                <div className="flex flex-wrap gap-2">
                  {product.sizes.map((size) => (
                    <label key={size} className="cursor-pointer">
                      <input type="radio" name="variant" value={size} required className="peer sr-only" />
                      <span className="inline-flex min-w-11 items-center justify-center px-3 py-2 rounded-xl border border-[#e5e5e8] bg-white text-sm font-semibold text-[#1c1c1f] hover:border-[#ff5a1f]/60 peer-checked:border-[#ff5a1f] peer-checked:bg-[#fff7ed] peer-checked:text-[#ff5a1f]">
                        {size}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="flex items-center border border-[#e5e5e8] rounded-lg overflow-hidden">
              <span className="px-3 text-[#6b6b76] text-sm">Menge</span>
              <input
                type="number"
                name="quantity"
                defaultValue={quantity}
                min={1}
                className="w-16 text-center py-2 border-l border-[#e5e5e8] focus:outline-none"
              />
            </div>
            <button
              disabled={product.stock <= 0}
              className="bg-[#ff5a1f] text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 glow-accent disabled:bg-[#e5e5e8] disabled:text-[#6b6b76] disabled:hover:opacity-100"
            >
              {product.stock <= 0 ? "Ausverkauft" : "In den Warenkorb"}
            </button>
          </form>

          <div className="grid grid-cols-2 gap-2 text-xs text-[#6b6b76] border-t border-[#e5e5e8] pt-4">
            <span className="flex items-center gap-1.5"><Truck size={14} className="text-[#1faa59]" /> Kostenloser Versand</span>
            <span className="flex items-center gap-1.5"><RotateCcw size={14} className="text-[#1faa59]" /> 30 Tage Rückgaberecht</span>
            <span className="flex items-center gap-1.5"><Lock size={14} className="text-[#1faa59]" /> Sichere Bezahlung</span>
            <span className="flex items-center gap-1.5"><ShieldCheck size={14} className="text-[#1faa59]" /> Käuferschutz</span>
          </div>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="text-xl font-bold mb-4">Bewertungen</h2>

        {canReview && (
          <form
            action={async (fd) => {
              "use server";
              await submitReview(product.id, fd);
            }}
            id="bewerten"
            className="bg-white border border-[#e5e5e8] rounded-2xl p-4 mb-6 space-y-3 shadow-sm"
          >
            <p className="font-semibold text-sm flex items-center gap-2">
              <BadgeCheck size={16} className="text-[#1faa59]" /> Produkt bewerten (verifizierter Kauf, +15 Coins)
            </p>
            <select name="rating" required defaultValue="5" className="bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-3 py-2 text-sm">
              <option value="5">5 Sterne – Ausgezeichnet</option>
              <option value="4">4 Sterne – Gut</option>
              <option value="3">3 Sterne – Okay</option>
              <option value="2">2 Sterne – Mäßig</option>
              <option value="1">1 Stern – Schlecht</option>
            </select>
            <textarea
              name="text"
              required
              rows={3}
              maxLength={2000}
              placeholder="Wie war das Produkt?"
              className="w-full bg-[#f4f4f5] border border-[#e5e5e8] rounded-lg px-3 py-2 text-sm"
            />
            <button className="bg-[#ff5a1f] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90">
              Bewertung abschicken
            </button>
          </form>
        )}

        {reviews.length === 0 ? (
          <p className="text-[#6b6b76] text-sm">Noch keine Bewertungen für dieses Produkt.</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div key={r.id} className="bg-white border border-[#e5e5e8] rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm flex items-center gap-1.5">
                    {r.authorName}
                    {r.verified && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-[#1faa59] bg-[#eafbf1] px-1.5 py-0.5 rounded">
                        <BadgeCheck size={12} /> Verifizierter Kauf
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-[#6b6b76]">
                    {r.createdAt.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </span>
                </div>
                <div className="flex mb-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      className={i < r.rating ? "text-[#ff5a1f]" : "text-[#e5e5e8]"}
                      fill={i < r.rating ? "currentColor" : "none"}
                    />
                  ))}
                </div>
                <p className="text-sm text-[#1c1c1f]">{r.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {similarProducts.length > 0 && (
        <div className="mt-12">
          <h2 className="text-xl font-bold mb-4">Ähnliche Produkte</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {similarProducts.map((p) => (
              <ProductCard
                key={p.id}
                id={p.id}
                name={p.name}
                price={p.price}
                image={p.image}
                shippingMinDays={p.shippingMinDays}
                shippingMaxDays={p.shippingMaxDays}
                discountPercent={p.discountPercent}
                stock={p.stock}
                rating={similarRatings.get(p.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
