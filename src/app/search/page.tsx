import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import ProductCard from "@/components/ProductCard";
import FilterBar from "@/components/FilterBar";
import Pagination from "@/components/Pagination";
import { applySortAndFilter } from "@/lib/productFilters";

const PAGE_SIZE = 24;

export default async function SearchPage(
  props: { searchParams: Promise<{ q?: string; sort?: string; minPrice?: string; maxPrice?: string; page?: string }> }
) {
  const searchParams = await props.searchParams;
  const q = (searchParams.q || "").trim();

  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;

  // Volltextsuche direkt in der DB per ILIKE (parametrisiert, SQL-sicher).
  let rawResults: Awaited<ReturnType<typeof prisma.product.findMany>> = [];
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const idRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Product"
      WHERE name ILIKE ${pattern} OR description ILIKE ${pattern}
    `;
    const ids = idRows.map((r) => r.id);
    rawResults = ids.length > 0 ? await prisma.product.findMany({ where: { id: { in: ids } } }) : [];
  }

  const { products: allProducts, ratingsMap } = await applySortAndFilter(rawResults, searchParams);

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
        {q ? `Suchergebnisse für "${q}"` : "Suche"}
        {q && allProducts.length > 0 && (
          <span className="text-base font-normal text-[#6b6b76] ml-2">({allProducts.length} Treffer)</span>
        )}
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
            basePath="/search"
            params={{ q, sort: searchParams.sort, minPrice: searchParams.minPrice, maxPrice: searchParams.maxPrice }}
          />
        </>
      )}
    </div>
  );
}
