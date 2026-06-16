import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { addToCart, toggleWishlist } from "@/lib/actions";
import { auth } from "@/lib/auth";
import { getProductRating } from "@/lib/reviews";
import { getRatingsMap } from "@/lib/reviews";
import ProductImage from "@/components/ProductImage";
import ProductCard from "@/components/ProductCard";
import Link from "next/link";
import { Truck, Star, Heart } from "lucide-react";

export default async function ProductPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ qty?: string }> }) {
  const { id } = await props.params;
  const { qty } = await props.searchParams;
  const quantity = Math.max(1, parseInt(qty || "1", 10) || 1);

  const product = await prisma.product.findUnique({
    where: { id },
    include: { category: true },
  });

  if (!product) notFound();

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

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

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href={`/category/${product.category.slug}`} className="text-sm text-[#6b6b76] hover:text-[#1c1c1f]">
        ← {product.category.name}
      </Link>
      <div className="grid md:grid-cols-2 gap-8 mt-4">
        <div className="aspect-square text-[8rem] flex items-center justify-center bg-white border border-[#e5e5e8] rounded-2xl overflow-hidden relative">
          <ProductImage image={product.image} className="text-[8rem] w-full h-full object-cover flex items-center justify-center" />
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
        <div className="space-y-4">
          <h1 className="text-2xl font-bold">{product.name}</h1>
          <p className="text-3xl font-extrabold text-[#ff5a1f]">{product.price.toFixed(2)} €</p>

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
          <p className="text-sm text-[#6b6b76]">{product.stock} Stück verfügbar</p>

          <form
            action={async (fd) => {
              "use server";
              const q = Math.max(1, parseInt(String(fd.get("quantity")), 10) || 1);
              await addToCart(product.id, q);
            }}
            className="flex items-center gap-3"
          >
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
            <button className="bg-[#ff5a1f] text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 glow-accent">
              In den Warenkorb
            </button>
          </form>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="text-xl font-bold mb-4">Bewertungen</h2>
        {reviews.length === 0 ? (
          <p className="text-[#6b6b76] text-sm">Noch keine Bewertungen für dieses Produkt.</p>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div key={r.id} className="bg-white border border-[#e5e5e8] rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">{r.authorName}</span>
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
                rating={similarRatings.get(p.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
