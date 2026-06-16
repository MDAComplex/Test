import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProductCard from "@/components/ProductCard";
import AdBanner from "@/components/AdBanner";
import { CATEGORIES } from "@/lib/categories";
import Link from "next/link";

export default async function HomePage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  let preferredSlugs: string[] = [];
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    preferredSlugs = (user?.preferences || "").split(",").filter(Boolean);
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

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-8">
      <section className="bg-gradient-to-r from-violet-700 to-fuchsia-600 text-white rounded-2xl p-8 text-center">
        <h1 className="text-3xl font-extrabold mb-2">
          {preferredSlugs.length > 0 ? "Für dich ausgewählt ✨" : "Willkommen bei Viralo.shop"}
        </h1>
        <p className="text-violet-100">
          Von Beauty bis Elektronik – entdecke Tausende Artikel, leg sie in den Warenkorb und teste den kompletten Checkout.
        </p>
        {!session?.user && (
          <Link href="/register" className="inline-block mt-4 bg-amber-400 text-violet-900 font-bold px-6 py-2 rounded-full">
            Jetzt registrieren & Präferenzen wählen
          </Link>
        )}
      </section>

      <AdBanner slot="home-top" />

      <section className="flex gap-2 overflow-x-auto pb-2">
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            href={`/category/${c.slug}`}
            className="shrink-0 bg-white border rounded-full px-4 py-2 text-sm font-medium hover:bg-violet-50"
          >
            {c.emoji} {c.name}
          </Link>
        ))}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-4">
          {preferredSlugs.length > 0 ? "Empfohlen für dich" : "Beliebte Produkte"}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
