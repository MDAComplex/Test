import type { Product } from "@prisma/client";
import { getRatingsMap } from "@/lib/reviews";

export type SortOption = "newest" | "price-asc" | "price-desc" | "rating";

export type FilterParams = {
  sort?: string;
  minPrice?: string;
  maxPrice?: string;
};

export async function applySortAndFilter<T extends Product>(
  products: T[],
  params: FilterParams
): Promise<{ products: (T & { rating?: { avg: number; count: number } })[]; ratingsMap: Map<string, { avg: number; count: number }> }> {
  const minPrice = params.minPrice ? parseFloat(params.minPrice) : undefined;
  const maxPrice = params.maxPrice ? parseFloat(params.maxPrice) : undefined;

  let filtered = products;
  if (minPrice !== undefined && !isNaN(minPrice)) {
    filtered = filtered.filter((p) => p.price >= minPrice);
  }
  if (maxPrice !== undefined && !isNaN(maxPrice)) {
    filtered = filtered.filter((p) => p.price <= maxPrice);
  }

  const ratingsMap = await getRatingsMap(filtered.map((p) => p.id));

  const sort = (params.sort as SortOption) || "newest";
  let sorted = [...filtered];
  if (sort === "price-asc") {
    sorted.sort((a, b) => a.price - b.price);
  } else if (sort === "price-desc") {
    sorted.sort((a, b) => b.price - a.price);
  } else if (sort === "rating") {
    sorted.sort((a, b) => (ratingsMap.get(b.id)?.avg ?? 0) - (ratingsMap.get(a.id)?.avg ?? 0));
  } else {
    sorted.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  return { products: sorted, ratingsMap };
}
