import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ProductCard from "@/components/ProductCard";
import FilterBar from "@/components/FilterBar";
import { notFound } from "next/navigation";
import { applySortAndFilter } from "@/lib/productFilters";

export default async function CategoryPage(
  props: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ sort?: string; minPrice?: string; maxPrice?: string }>;
  }
) {
  const { slug } = await props.params;
  const searchParams = await props.searchParams;

  const category = await prisma.category.findUnique({
    where: { slug },
    include: { products: true },
  });

  if (!category) notFound();

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  const { products, ratingsMap } = await applySortAndFilter(category.products, searchParams);

  const wishlistedIds = userId
    ? new Set(
        (await prisma.wishlist.findMany({ where: { userId, productId: { in: products.map((p) => p.id) } } })).map(
          (w) => w.productId
        )
      )
    : new Set<string>();

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">{category.name}</h1>
      <FilterBar
        action={`/category/${slug}`}
        sort={searchParams.sort}
        minPrice={searchParams.minPrice}
        maxPrice={searchParams.maxPrice}
      />
      {products.length === 0 ? (
        <p className="text-[#6b6b76]">Noch keine Artikel in dieser Kategorie.</p>
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
              discountPercent={p.discountPercent}
              stock={p.stock}
              rating={ratingsMap.get(p.id)}
              isWishlisted={wishlistedIds.has(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
