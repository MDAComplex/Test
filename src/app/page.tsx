import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProductCard from "@/components/ProductCard";
import AdBanner from "@/components/AdBanner";
import { CATEGORIES } from "@/lib/categories";
import { getRank } from "@/lib/rewards";
import Link from "next/link";

export default async function HomePage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  let preferredSlugs: string[] = [];
  let dbUser = null;
  if (userId) {
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-10">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#ffffff] via-[#ffffff] to-[#fdeee8] border border-[#e5e5e8] p-6 sm:p-10 text-center">
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-[#ff5a1f] opacity-20 blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full bg-[#1faa59] opacity-20 blur-3xl" />
        <h1 className="text-2xl sm:text-4xl font-extrabold mb-3 relative">
          {dbUser ? "Shoppe ohne Reue ✨" : "Willkommen bei Viralo.shop"}
        </h1>
        <p className="text-[#6b6b76] relative max-w-lg mx-auto">
          Stöbere echte Artikel, leg sie in den Warenkorb, durchlaufe den kompletten Checkout —
          und zahl dabei <span className="text-[#1faa59] font-semibold">0 €</span>. Sammle Coins,
          steig Level auf und sieh, wie viel du &quot;gespart&quot; hast.
        </p>
        {dbUser ? (
          <div className="relative mt-6 flex flex-wrap justify-center gap-3">
            <div className="bg-[#eafbf1] border border-[#e5e5e8] rounded-2xl px-5 py-3">
              <p className="text-xs text-[#6b6b76]">Gespart gesamt</p>
              <p className="text-xl font-extrabold text-[#1faa59]">{dbUser.totalSaved.toFixed(2)} €</p>
            </div>
            <div className="bg-[#f4f4f5] border border-[#e5e5e8] rounded-2xl px-5 py-3">
              <p className="text-xs text-[#6b6b76]">Rang</p>
              <p className="text-xl font-extrabold">{rank?.current.emoji} {rank?.current.label}</p>
            </div>
            <div className="bg-[#f4f4f5] border border-[#e5e5e8] rounded-2xl px-5 py-3">
              <p className="text-xs text-[#6b6b76]">Streak</p>
              <p className="text-xl font-extrabold text-[#1faa59]">🔥 {dbUser.streak} Tage</p>
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
            {c.emoji} {c.name}
          </Link>
        ))}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">
          {preferredSlugs.length > 0 ? "✨ Für dich ausgewählt" : "🔥 Trending"}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {products.slice(0, 10).map((p) => (
            <ProductCard
              key={p.id}
              id={p.id}
              name={p.name}
              price={p.price}
              image={p.image}
              shippingMinDays={p.shippingMinDays}
              shippingMaxDays={p.shippingMaxDays}
            />
          ))}
        </div>
      </section>

      <AdBanner slot="home-feed" />

      <section>
        <h2 className="text-xl font-bold mb-4">Mehr entdecken</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {products.slice(10, 30).map((p) => (
            <ProductCard
              key={p.id}
              id={p.id}
              name={p.name}
              price={p.price}
              image={p.image}
              shippingMinDays={p.shippingMinDays}
              shippingMaxDays={p.shippingMaxDays}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
