import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProductCard from "@/components/ProductCard";
import RewardIcon from "@/components/RewardIcon";
import AdBanner from "@/components/AdBanner";
import { CATEGORIES } from "@/lib/categories";
import { getRank, grantDeliveryRewards } from "@/lib/rewards";
import { getRatingsMap } from "@/lib/reviews";
import { Flame, Sparkles, PackagePlus, History } from "lucide-react";
import Link from "next/link";

export default async function HomePage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  let preferredSlugs: string[] = [];
  let dbUser = null;
  if (userId) {
    // Lazy-Check: zugestellte Bestellungen belohnen + Benachrichtigungen anlegen.
    await grantDeliveryRewards(userId);
    dbUser = await prisma.user.findUnique({ where: { id: userId } });
    preferredSlugs = (dbUser?.preferences || "").split(",").filter(Boolean);
  }

  const allProducts = await prisma.product.findMany({
    include: { category: true },
    orderBy: { createdAt: "desc" },
  });

  let products = allProducts;
  if (preferredSlugs.length > 0) {
    const preferred = allProducts.filter((p) => preferredSlugs.includes(p.category.slug));
    const rest = allProducts.filter((p) => !preferredSlugs.includes(p.category.slug));
    products = [...preferred, ...rest];
  }

  const rank = dbUser ? getRank(dbUser.coins) : null;
  const newest = allProducts.slice(0, 5);

  // Zuletzt angesehen (max. 8, neueste zuerst) — billig: ein kleiner Query.
  const recentlyViewed = userId
    ? (
        await prisma.recentlyViewed.findMany({
          where: { userId },
          orderBy: { viewedAt: "desc" },
          take: 8,
          include: { product: true },
        })
      ).map((rv) => rv.product)
    : [];

  const visibleIds = [...new Set([...products.slice(0, 30), ...newest, ...recentlyViewed].map((p) => p.id))];
  const ratingsMap = await getRatingsMap(visibleIds);
  const wishlistedIds = userId
    ? new Set(
        (await prisma.wishlist.findMany({ where: { userId, productId: { in: visibleIds } } })).map(
          (w) => w.productId
        )
      )
    : new Set<string>();

  const cardProps = (p: {
    id: string;
    name: string;
    price: number;
    image: string;
    shippingMinDays: number;
    shippingMaxDays: number;
    discountPercent: number;
    stock: number;
  }) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    image: p.image,
    shippingMinDays: p.shippingMinDays,
    shippingMaxDays: p.shippingMaxDays,
    discountPercent: p.discountPercent,
    stock: p.stock,
    rating: ratingsMap.get(p.id),
    isWishlisted: wishlistedIds.has(p.id),
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-10">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#ffffff] via-[#ffffff] to-[#fdeee8] border border-[#e5e5e8] p-6 sm:p-10 text-center">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[#ff5a1f] opacity-20 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-[#1faa59] opacity-20 blur-3xl" />
        <h1 className="text-2xl sm:text-4xl font-extrabold mb-3 relative">
          {dbUser ? `Willkommen zurück${dbUser.name ? `, ${dbUser.name}` : ""}` : "Willkommen bei Viralo.shop"}
        </h1>
        <p className="text-[#6b6b76] relative max-w-lg mx-auto">
          Entdecke Top-Artikel, bestelle mit vollem Checkout-Erlebnis und verfolge deine Pakete —
          bezahlt wird <span className="text-[#1faa59] font-semibold">CHF 0.00</span> (Demo).
          Sammle Coins bei jeder Zustellung und steig im Rang auf.
        </p>
        {dbUser ? (
          <div className="relative mt-6 flex flex-wrap justify-center gap-3">
            <div className="bg-[#eafbf1] border border-[#e5e5e8] rounded-2xl px-5 py-3">
              <p className="text-xs text-[#6b6b76]">Gespart gesamt</p>
              <p className="text-xl font-extrabold text-[#1faa59]">{dbUser.totalSaved.toFixed(2)} €</p>
            </div>
            <div className="bg-[#f4f4f5] border border-[#e5e5e8] rounded-2xl px-5 py-3">
              <p className="text-xs text-[#6b6b76]">Rang</p>
              <p className="text-xl font-extrabold flex items-center gap-1.5">
                <RewardIcon iconKey={rank!.current.iconKey} size={18} className="text-[#ff5a1f]" />
                {rank?.current.label}
              </p>
            </div>
            <div className="bg-[#f4f4f5] border border-[#e5e5e8] rounded-2xl px-5 py-3">
              <p className="text-xs text-[#6b6b76]">Streak</p>
              <p className="text-xl font-extrabold text-[#1faa59] flex items-center gap-1.5">
                <Flame size={18} /> {dbUser.streak} Tage
              </p>
            </div>
          </div>
        ) : (
          <Link
            href="/register"
            className="inline-block mt-6 bg-[#ff5a1f] text-white font-bold px-6 py-3 rounded-lg glow-accent relative"
          >
            Jetzt registrieren & Coins sichern
          </Link>
        )}
      </section>

      <AdBanner slot="home-top" />

      <section className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            href={`/category/${c.slug}`}
            className="shrink-0 bg-[#ffffff] border border-[#e5e5e8] rounded-lg px-4 py-2 text-sm font-medium hover:border-[#ff5a1f]/60"
          >
            {c.name}
          </Link>
        ))}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          {preferredSlugs.length > 0 ? (
            <>
              <Sparkles size={20} className="text-[#ff5a1f]" /> Für dich ausgewählt
            </>
          ) : (
            <>
              <Flame size={20} className="text-[#ff5a1f]" /> Trending
            </>
          )}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {products.slice(0, 10).map((p) => (
            <ProductCard key={p.id} {...cardProps(p)} />
          ))}
        </div>
      </section>

      {recentlyViewed.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <History size={20} className="text-[#6b6b76]" /> Zuletzt angesehen
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {recentlyViewed.map((p) => (
              <ProductCard key={p.id} {...cardProps(p)} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <PackagePlus size={20} className="text-[#1faa59]" /> Neu eingetroffen
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {newest.map((p) => (
            <ProductCard key={p.id} {...cardProps(p)} />
          ))}
        </div>
      </section>

      <AdBanner slot="home-feed" />

      <section>
        <h2 className="text-xl font-bold mb-4">Mehr entdecken</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {products.slice(10, 30).map((p) => (
            <ProductCard key={p.id} {...cardProps(p)} />
          ))}
        </div>
      </section>
    </div>
  );
}
