import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ProductCard from "@/components/ProductCard";
import FilterBar from "@/components/FilterBar";
import { applySortAndFilter } from "@/lib/productFilters";

export default async function SearchPage(
  props: { searchParams: Promise<{ q?: string; sort?: string; minPrice?: string; maxPrice?: string }> }
) {
  const searchParams = await props.searchParams;
  const q = (searchParams.q || "").trim();

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const qLower = q.toLowerCase();
  const rawResults = q
    ? (await prisma.product.findMany()).filter(
        (p) => p.name.toLowerCase().includes(qLower) || p.description.toLowerCase().includes(qLower)
      )
    : [];

  const { products, ratingsMap } = await applySortAndFilter(rawResults, searchParams);

  const wishlistedIds = userId
    ? new Set(
        (await prisma.wishlist.findMany({ where: { userId, productId: { in: products.map((p) => p.id) } } })).map(
          (w) => w.productId
        )
      )
    : new Set<string>();

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">
        {q ? `Suchergebnisse für "${q}"` : "Suche"}
      </h1>
      <FilterBar
        action="/search"
        query={q}
        sort={searchParams.sort}
        minPrice={searchParams.minPrice}
        maxPrice={searchParams.maxPrice}
      />
      {!q ? (
        <p className="text-[#6b6b76]">Bitte gib einen Suchbegriff ein.</p>
      ) : products.length === 0 ? (
        <p className="text-[#6b6b76]">Keine Produkte gefunden.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              id={p.id}
              name={p.name}
              price={p.price}
              image={p.image}
              shippingMinDays={p.shippingMinDays}
              shippingMaxDays={p.shippingMaxDays}
              rating={ratingsMap.get(p.id)}
              isWishlisted={wishlistedIds.has(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
