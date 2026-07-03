import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ProductCard from "@/components/ProductCard";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import { notFound } from "next/navigation";
import { applySortAndFilter } from "@/lib/productFilters";

const PAGE_SIZE = 24;

export default async function CategoryPage(
  props: {
    params: Promise<{ slug: string }>;
    searchParams: Promise<{ sort?: string; minPrice?: string; maxPrice?: string; page?: string }>;
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

  const { products: allProducts, ratingsMap } = await applySortAndFilter(category.products, searchParams);

  const totalPages = Math.max(1, Math.ceil(allProducts.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, parseInt(searchParams.page || "1", 10) || 1), totalPages);
  const products = allProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const wishlistedIds = userId
    ? new Set(
        (await prisma.wishlist.findMany({ where: { userId, productId: { in: products.map((p) => p.id) } } })).map(
          (w) => w.productId
        )
      )
    : new Set<string>();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <h1 className="text-2xl font-bold mb-6">
        {category.name}
        {allProducts.length > 0 && (
          <span className="text-base font-normal text-[#6b6b76] ml-2">({allProducts.length} Artikel)</span>
        )}
      </h1>
      <FilterBar
        action={`/category/${slug}`}
        sort={searchParams.sort}
        minPrice={searchParams.minPrice}
        maxPrice={searchParams.maxPrice}
      />
      {products.length === 0 ? (
        <p className="text-[#6b6b76]">Noch keine Artikel in dieser Kategorie.</p>
      ) : (
        <>
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
          <Pagination
            page={page}
            totalPages={totalPages}
            basePath={`/category/${slug}`}
            params={{ sort: searchParams.sort, minPrice: searchParams.minPrice, maxPrice: searchParams.maxPrice }}
          />
        </>
      )}
    </div>
  );
}
